/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'node:fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Connection } from '@salesforce/core';
import { FieldValue, SeedingStep, SuccessResult } from '../../../types/index.js';
import { resolveFakerExpression } from '../../../utils/faker.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@ravi004/sf-seeder', 'seeder.plan.run');

function isSuccess(result: SuccessResult): result is SuccessResult {
    return result.success === true && typeof result.id === 'string';
}

export default class SeederPlanRun extends SfCommand<void> {
    public static readonly summary = messages.getMessage('summary');
    public static readonly description = messages.getMessage('description');
    public static readonly examples = messages.getMessages('examples');

    public static readonly flags = {
        'target-org': Flags.requiredOrg({
            summary: messages.getMessage('flags.target-org.summary'),
        }),
        plan: Flags.file({
            summary: messages.getMessage('flags.plan.summary'),
            char: 'p',
            required: true,
            exists: true,
        }),
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(SeederPlanRun);
        const conn = flags['target-org'].getConnection();
        const userInfo = await conn.identity();

        this.log(`Connected to org: ${userInfo.username}`);

        const fileContent = fs.readFileSync(flags.plan, 'utf-8');
        // this.log(`Loaded file content from ${flags.plan}:\n${fileContent}`);

        const planList: SeedingStep[] = JSON.parse(fileContent) as SeedingStep[];

        this.log('Starting data seeding...');

        const referenceMap = new Map<string, SuccessResult[]>();

        for (const step of planList) {
            // eslint-disable-next-line no-await-in-loop
            await this.processStep(conn, step, referenceMap);
        }

        this.log('Data seeding plan completed successfully!');
    }

    private async processStep(
        conn: Connection,
        step: SeedingStep,
        referenceMap: Map<string, SuccessResult[]>
    ): Promise<void> {
        this.log(`Inserting ${step.count} record(s) into ${step.sobject}...`);

        const records: Array<Record<string, FieldValue>> = [];

        for (let i = 0; i < step.count; i++) {
            const record: Record<string, FieldValue> = {};
            for (const [field, value] of Object.entries(step.fields)) {
                record[field] = this.processValue(value, i, referenceMap);
            }
            records.push(record);
        }

        if (!records.length) {
            this.warn(`No records to create for ${step.sobject}. Skipping...`);
            return;
        }

        try {
            const results: SuccessResult[] = (await conn.bulk.load(step.sobject, 'insert', records)) as SuccessResult[];
            //   this.log(`Success Result ${JSON.stringify(results)}`);

            const successes: SuccessResult[] = results.filter(isSuccess);
            const failures: SuccessResult[] = results.filter((r) => !isSuccess(r));

            if (step.saveRefs) {
                referenceMap.set(step.sobject, successes);
            }

            if (failures.length) {
                this.warn(`${failures.length} failed insert(s):`);
                failures.forEach((err) =>
                    this.warn(`• ID: ${err.id ?? 'N/A'} — ${err.errors?.join(', ') || 'Unknown error'}\n`)
                );
            }

            this.log(`Inserted ${successes.length}/${records.length} successfully.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.error(`Failed inserting ${step.sobject}: ${message}`);
        }
    }

    private processValue(value: FieldValue, counter: number, referenceMap: Map<string, SuccessResult[]>): FieldValue {
        if (typeof value !== 'string') return value;

        const fakerResolved: FieldValue = resolveFakerExpression(value, this.warn.bind(this));
        if (fakerResolved !== null) return fakerResolved;

        // Replace #{counter} → number
        const resolved: FieldValue = value.replace(/#\{counter\}/g, (counter + 1).toString());

        // Replace @{Object.Id}
        if (resolved.startsWith('@{') && resolved.endsWith('}')) {
            const refKey = resolved.slice(2, -1).split('.')[0];
            const refList = referenceMap.get(refKey);

            if (refList && refList.length > 0) {
                const random = refList[Math.floor(Math.random() * refList.length)];
                return random.id;
            }

            this.warn(`Reference not found for key: ${refKey}. Returning null.`);
            return null;
        }

        return resolved;
    }
}
