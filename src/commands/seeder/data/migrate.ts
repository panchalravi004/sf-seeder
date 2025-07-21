/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { DescribeSObjectResult } from '@jsforce/jsforce-node';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Connection } from '@salesforce/core';
import { MigrationPlan, FieldValue } from '../../../types/index.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url)
const messages = Messages.loadMessages('@ravi004/sf-seeder', 'seeder.data.migrate');

export default class SeederDataMigrate extends SfCommand<void> {

    public static readonly summary = messages.getMessage('summary');
    public static readonly description = messages.getMessage('description');
    public static readonly examples = messages.getMessages('examples');

    public static readonly flags = {
        'source-org': Flags.requiredOrg({
            summary: messages.getMessage('flags.source-org.summary'),
            char: 's'
        }),
        'target-org': Flags.requiredOrg({
            summary: messages.getMessage('flags.target-org.summary'),
            char: 't'
        }),
        plan: Flags.file({
            summary: messages.getMessage('flags.plan.summary'),
            char: 'p',
            required: true,
            exists: true,
        }),
    };

    private describeCache: Record<string, DescribeSObjectResult> = {};

    public async run(): Promise<void> {
        const { flags } = await this.parse(SeederDataMigrate);

        const targetOrg = flags['target-org'];
        const sourceOrg = flags['source-org'];
        const plans = flags['plan'];

        const sourceConn = sourceOrg.getConnection();
        const targetConn = targetOrg.getConnection();

        const sourceUserInfo = await sourceConn.identity();
        const targetUserInfo = await targetConn.identity();

        this.log(chalk.green(`Connected to source org: ${sourceUserInfo.username}`));
        this.log(chalk.green(`Connected to target org: ${targetUserInfo.username}`));

        const planPath = path.resolve(plans);
        const fileContent = fs.readFileSync(planPath, 'utf-8');
        const planList: MigrationPlan = JSON.parse(fileContent) as MigrationPlan;

        await this.runMigrationPlan(sourceConn, targetConn, planList);

        this.log('✅ Data migration completed!');
    }

    private async runMigrationPlan(sourceConn: Connection, targetConn: Connection, plan: MigrationPlan): Promise<void> {
        const idMapBySObject: Record<string, Map<string, string>> = {};

        for (const obj of plan.objects) {
            try {
                this.log(`🔍 Validating query for ${obj.sobject}`);

                if (!obj.query) throw new Error('Query must be defined in the plan.');

                // eslint-disable-next-line no-await-in-loop
                const { cleanedQuery, keptFields } = await this.sanitizeSOQLQuery(targetConn, obj.query);
                // eslint-disable-next-line no-await-in-loop
                const referenceFieldMap = await this.getReferenceFieldMap(sourceConn, obj.sobject, keptFields);

                // eslint-disable-next-line no-await-in-loop
                const records = await sourceConn.query(cleanedQuery);
                this.log(`📦 Retrieved ${records.totalSize} records from ${obj.sobject}`);

                const sourceToInsert: Array<Record<string, FieldValue>> = [];
                const idMap = new Map<string, string>();

                for (const record of records.records) {
                    const originalId = record['Id'] as string;
                    const clone = { ...record };
                    delete clone.Id; delete clone.attributes;

                    // eslint-disable-next-line no-await-in-loop
                    await this.resolveReferencesWithFieldMap(sourceConn, clone, referenceFieldMap, idMapBySObject);

                    sourceToInsert.push(clone);
                    idMap.set(originalId, ''); // temp placeholder
                }

                this.log(`🚚 Inserting ${sourceToInsert.length} ${obj.sobject} into target org...`);

                // eslint-disable-next-line no-await-in-loop
                const insertResults = await targetConn.insert(obj.sobject, sourceToInsert);

                insertResults.forEach((result, index) => {
                    const oldId = Array.from(idMap.keys())[index];
                    if (result.success) {
                        idMap.set(oldId, result.id);
                    } else {
                        this.log(`[!] Failed to insert ${obj.sobject} record (${oldId}): ${result.errors?.join(', ')}`);
                    }
                });

                idMapBySObject[obj.sobject] = idMap;
                const successCount = insertResults.filter(r => r.success).length;

                this.log(`✅ Inserted ${successCount}/${sourceToInsert.length} records into ${obj.sobject}`);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                this.error(`❌ Error with ${obj.sobject}: ${message}`);
            }
        }
    }


    private async sanitizeSOQLQuery(
        conn: Connection,
        soql: string
    ): Promise<{ cleanedQuery: string; keptFields: string[] }> {
        const match = soql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
        if (!match) throw new Error(`Invalid SOQL: ${soql}`);

        const fieldListRaw = match[1];
        const sobject = match[2];

        const fields = fieldListRaw.split(',').map(f => f.trim());
        if (!this.describeCache[sobject]) {
            this.describeCache[sobject] = await conn.sobject(sobject).describe();
        }
        const describe = this.describeCache[sobject];

        const editableFields = new Set(
            describe.fields
                .filter(f => f.updateable && !f.calculated)
                .map(f => f.name)
        );

        const kept: string[] = [];
        const skipped: string[] = [];

        for (const field of fields) {
            if (editableFields.has(field)) {
                kept.push(field);
            } else {
                const info = describe.fields.find(f => f.name === field);
                const reason = info?.calculated
                    ? 'Formula field'
                    : info?.custom
                        ? 'Custom non-editable'
                        : 'Standard non-editable';
                this.log(`[!] Skipped field "${field}" on "${sobject}" - ${reason}`);
                skipped.push(field);
            }
        }

        const cleanedQuery = `SELECT ${kept.join(', ')} FROM ${sobject}`;
        return { cleanedQuery, keptFields: kept };
    }

    private async getReferenceFieldMap(
        conn: Connection,
        sobject: string,
        keptFields: string[]
    ): Promise<Record<string, string[]>> {
        if (!this.describeCache[sobject]) {
            this.describeCache[sobject] = await conn.sobject(sobject).describe();
        }

        const fieldMap: Record<string, string[]> = {};

        for (const fieldName of keptFields) {
            const fieldMeta = this.describeCache[sobject].fields.find(f => f.name === fieldName);
            if (fieldMeta && fieldMeta.type === 'reference' && fieldMeta.referenceTo) {
                fieldMap[fieldName] = fieldMeta.referenceTo;
            }
        }

        return fieldMap;
    }

    private async resolveReferencesWithFieldMap(
        conn: Connection,
        record: Record<string, FieldValue>,
        referenceFieldMap: Record<string, string[]>,
        idMapBySObject: Record<string, Map<string, string>>
    ): Promise<void> {
        for (const [fieldName, value] of Object.entries(record)) {
            if (!value || typeof value !== 'string' || !value.startsWith('0')) continue;

            const possibleObjects = referenceFieldMap[fieldName];
            if (!possibleObjects) continue;

            let referencedObject: string | undefined;

            if (possibleObjects.length === 1) {
                referencedObject = possibleObjects[0];
            } else {
                const idPrefix = value.substring(0, 3);
                for (const obj of possibleObjects) {
                    if (!this.describeCache[obj]) {
                        // eslint-disable-next-line no-await-in-loop
                        this.describeCache[obj] = await conn.sobject(obj).describe();
                    }
                    if (this.describeCache[obj].keyPrefix === idPrefix) {
                        referencedObject = obj;
                        break;
                    }
                }
            }

            if (referencedObject && idMapBySObject[referencedObject]) {
                const mappedId = idMapBySObject[referencedObject].get(value);
                if (mappedId) {
                    record[fieldName] = mappedId;
                }
            }
        }
    }



}
