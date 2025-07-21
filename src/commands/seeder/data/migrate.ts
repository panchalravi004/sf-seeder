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
import { Messages, Connection } from '@salesforce/core';
import { MigrationPlan } from '../../../types/index.js';

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

    public async runMigrationPlan(sourceConn: Connection, targetConn: Connection, plan: MigrationPlan): Promise<void> {
        for (const obj of plan.objects) {
            try {
                this.log(`🔍 Validating query for ${obj.sobject}`);

                // eslint-disable-next-line no-await-in-loop
                const { cleanedQuery } = await this.sanitizeSOQLQuery(targetConn, obj.query ?? `SELECT FIELDS(ALL) FROM ${obj.sobject}`);

                // eslint-disable-next-line no-await-in-loop
                const records = await sourceConn.query(cleanedQuery);

                this.log(`📦 Retrieved ${records.totalSize} records from ${obj.sobject}`);

                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const cleanedRecords = records.records.map(({ Id, attributes, ...rest }) => rest);

                this.log(`🚚 Inserting ${cleanedRecords.length} ${obj.sobject} into target org...`);
                // eslint-disable-next-line no-await-in-loop
                const insertResults = await targetConn.insert(obj.sobject, cleanedRecords);

                const successCount = insertResults.filter(r => r.success).length;
                this.log(`✅ Inserted ${successCount}/${cleanedRecords.length} records into ${obj.sobject}`);

            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';

                this.error(`❌ Error with ${obj.sobject}: ${message}`);
            }
        }
    }

    public async sanitizeSOQLQuery(
        conn: Connection,
        soql: string
    ): Promise<{ cleanedQuery: string; skippedFields: string[] }> {
        const match = soql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
        if (!match) throw new Error(`Invalid SOQL: ${soql}`);

        const fieldListRaw = match[1];
        const sobject = match[2];

        const fields = fieldListRaw.split(',').map(f => f.trim());
        const describe = await conn.sobject(sobject).describe();

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
        return { cleanedQuery, skippedFields: skipped };
    }
}
