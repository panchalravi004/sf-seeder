/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'node:fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { validatePlanStructure, validateMetadata } from '../../../utils/validator.js';
import { SeedingStep } from '../../../types/index.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url)
const messages = Messages.loadMessages('@ravi004/sf-seeder', 'seeder.plan.validate');

export default class SeederPlanValidate extends SfCommand<void> {
    public static readonly summary = messages.getMessage('summary');
    public static readonly description = messages.getMessage('description');
    public static readonly examples = messages.getMessages('examples');

    public static readonly flags = {
        'target-org': Flags.requiredOrg({
            summary: messages.getMessage('flags.target-org.summary'),
        }),
        'validate-metadata': Flags.boolean({
            summary: messages.getMessage('flags.validate-metadata.summary'),
            default: false,
        }),
        plan: Flags.file({
            char: 'p',
            summary: messages.getMessage('flags.plan.summary'),
            required: true,
            exists: true,
        }),
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(SeederPlanValidate);
        const conn = flags['target-org'].getConnection();
        const shouldValidateMetadata = flags['validate-metadata'];
        const userInfo = await conn.identity();

        this.log(`Connected to org: ${userInfo.username}`);

        const filePath = flags.plan;
        const content = fs.readFileSync(filePath, 'utf-8');

        let plan: SeedingStep[];

        try {
            plan = JSON.parse(content) as SeedingStep[];
        } catch (err) {
            this.error(`Invalid JSON format: ${(err as Error).message}`);
            return;
        }

        const structureValid = validatePlanStructure(plan, this.warn.bind(this));

        let metadataValid = true;
        if (shouldValidateMetadata) {
            metadataValid = await validateMetadata(plan, conn, this.log.bind(this), this.warn.bind(this));
        }

        if (!structureValid || !metadataValid) {
            this.error('Seeder Validation failed. Fix the above issues.');
        } else {
            this.log('Seeder Plan is valid and ready for seeding.');
        }
    }
}
