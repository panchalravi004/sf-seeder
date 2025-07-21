/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { Field } from 'jsforce';
import inquirer from 'inquirer';
import { getFakerForField } from '../../../utils/faker.js';
import { FieldValue, SeedingStep } from '../../../types/index.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@ravi004/sf-seeder', 'seeder.plan.generate');

export default class SeederPlanGenerate extends SfCommand<void> {
    public static readonly summary = messages.getMessage('summary');
    public static readonly description = messages.getMessage('description');
    public static readonly examples = messages.getMessages('examples');

    public static readonly flags = {
        'target-org': Flags.requiredOrg({
            summary: messages.getMessage('flags.target-org.summary'),
        }),
        objects: Flags.string({
            summary: messages.getMessage('flags.objects.summary'),
            required: true,
        }),
        count: Flags.integer({
            summary: messages.getMessage('flags.count.summary'),
            default: 3,
        }),
        output: Flags.string({
            summary: messages.getMessage('flags.output.summary'),
            default: 'seeding-plan.json',
        }),
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(SeederPlanGenerate);

        const targetOrg = flags['target-org'];
        const objects = flags['objects'];
        const count = flags['count'];
        const output = flags['output'];

        const conn = targetOrg.getConnection();
        const userInfo = await conn.identity();

        this.log(chalk.green(`Connected to org: ${userInfo.username}`));

        const sobjectNames = objects.split(',').map((name) => name.trim());
        const plan: SeedingStep[] = [];

        for (const [, sobject] of sobjectNames.entries()) {
            this.log(chalk.cyan(`🔍 Describing ${sobject}...`));
            // eslint-disable-next-line no-await-in-loop
            const metadata = await conn.describe(sobject);

            const fields: Record<string, FieldValue> = {};

            for (const field of metadata.fields) {
                if (field.deprecatedAndHidden || field.calculated || field.autoNumber) continue;
                if (!field.updateable || field.nillable === false) continue;

                // eslint-disable-next-line no-await-in-loop
                const fakerExpr = await getFakerForField(sobject, field as unknown as Field, sobjectNames);
                if (fakerExpr) {
                    fields[field.name] = fakerExpr;
                }
            }

            plan.push({
                sobject,
                count,
                saveRefs: false,
                fields,
            });
        }

        const sortedPlan = await this.getSmartOrderedPlan(plan);

        const outputPath = path.resolve(output);
        fs.writeFileSync(outputPath, JSON.stringify(sortedPlan, null, 2));
        this.log(chalk.green(`✅ Smart plan generated and saved to ${outputPath}`));
    }

    private async getSmartOrderedPlan(originalPlan: SeedingStep[]): Promise<SeedingStep[]> {
        const sObjectDepGraph = new Map<string, Map<string, string>>(); // SOBJECT    -> [FIELD <-> DEPENDANCY]
        const depSobjectGraph = new Map<string, Set<string>>(); // DEPENDANCY -> SOBJECT

        for (const step of originalPlan) {
            const deps = new Map<string, string>();
            for (const [field, value] of Object.entries(step.fields)) {
                if (typeof value === 'string' && value.startsWith('@{') && value.endsWith('}')) {
                    const refObj = value.slice(2, -1).split('.')[0];
                    if (refObj) {
                        deps.set(field, refObj);
                        depSobjectGraph.set(refObj, depSobjectGraph.get(refObj) ?? new Set<string>());
                        depSobjectGraph.get(refObj)!.add(step.sobject);
                    }
                }
            }
            if (deps.size !== 0) sObjectDepGraph.set(step.sobject, deps);
        }

        // 🧠 Prompt user to resolve cyclic references (if any)
        const cycleToRemove: string[] = await this.detectCyclesAndPrompt(sObjectDepGraph, depSobjectGraph);
        for (const cycle of cycleToRemove) {
            const [from, field, to] = cycle.trim().split('->');
            if (sObjectDepGraph.get(from.trim())) sObjectDepGraph.get(from.trim())?.delete(field.trim());
            if (depSobjectGraph.get(to.trim())) depSobjectGraph.get(to.trim())?.delete(from.trim());
            if (depSobjectGraph.get(to.trim())?.size === 0) depSobjectGraph.delete(to.trim());

            const plan = originalPlan.find((item) => item.sobject === from.trim());
            if (plan?.fields) delete plan.fields[field.trim()];
        }

        for (const step of originalPlan) {
            step.saveRefs = depSobjectGraph.has(step.sobject);
        }

        const sortedSObjects: string[] = [];
        const visited = new Set<string>();
        const tempMark = new Set<string>();

        function visit(node: string): void {
            if (tempMark.has(node)) {
                throw new Error(`Cyclic dependency detected with ${node}`);
            }
            if (!visited.has(node)) {
                tempMark.add(node);
                const deps = sObjectDepGraph.get(node) ?? new Set();
                for (const dep of deps.values()) {
                    visit(dep as string);
                }
                tempMark.delete(node);
                visited.add(node);
                sortedSObjects.push(node);
            }
        }

        for (const node of sObjectDepGraph.keys()) {
            visit(node);
        }

        const sortedPlan = sortedSObjects
            .map((objName) => originalPlan.find((p) => p.sobject === objName))
            .filter((p): p is SeedingStep => p !== undefined);

        return sortedPlan;
    }

    private async detectCyclesAndPrompt(
        sObjectDepGraph: Map<string, Map<string, string>>,
        depSobjectGraph: Map<string, Set<string>>
    ): Promise<string[]> {
        const cyclicDependancy: Array<Map<string, string>> = [];
        const groupMap = new Map<string, Array<{ from: string; field: string; to: string }>>();

        for (const sObject of sObjectDepGraph.keys()) {
            const deps: Map<string, string> | undefined = sObjectDepGraph.get(sObject);
            if (deps) {
                for (const field of deps.keys()) {
                    const refObj: string | undefined = deps.get(field);
                    if (refObj && depSobjectGraph.has(refObj) && depSobjectGraph.get(sObject)?.has(refObj)) {
                        const temp: Map<string, string> = new Map<string, string>();
                        temp.set('sobject', sObject);
                        temp.set('field', field);
                        temp.set('refObject', refObj);
                        cyclicDependancy.push(temp);
                    }
                }
            }
        }

        for (const dep of cyclicDependancy) {
            const from = dep.get('sobject')!;
            const field = dep.get('field')!;
            const to = dep.get('refObject')!;
            const key = [from, to].sort().join('__'); // same key for A->B and B->A

            if (!groupMap.has(key)) {
                groupMap.set(key, []);
            }
            groupMap.get(key)!.push({ from, field, to });
        }

        const selectedRemovals: Set<string> = new Set();

        for (const [groupKey, relations] of groupMap.entries()) {
            this.log(`\n🔁 Cyclic Reference Detected in Group: ${groupKey.replace('__', ' ⇄ ')}`);

            const choices: string[] = [];
            for (const rel of relations) {
                choices.push(`${rel.from} -> ${rel.field} -> ${rel.to} -> Lookup`);
            }

            // eslint-disable-next-line no-await-in-loop
            const result = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'toRemove',
                    message: 'Select one object to remove to break this cycle:',
                    choices,
                },
            ]);

            selectedRemovals.add(result.toRemove as string);
        }

        return Array.from(selectedRemovals);
    }
}
