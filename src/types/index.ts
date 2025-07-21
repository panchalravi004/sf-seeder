/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

export type FieldValue = string | number | boolean | null;

// Each step in the seeding plan JSON
export type SeedingStep = {
	sobject: string; // API name of the object (e.g., "Account")
	count: number; // Number of records to create
	saveRefs?: boolean; // Save references for later use
	fields: Record<string, FieldValue>; // Field-value mappings
};

// Result of a DML operation (used for reference resolution & reporting)
export type SuccessResult = {
	success: true | false;
	id: string;
	errors: string[];
};

export type MigrationPlan = {
	objects: MigrationObject[];
}

export type MigrationObject = {
	sobject: string;

	/**
	 * Optional: Custom SOQL query to retrieve records from the source org.
	 * If not provided, default to `SELECT FIELDS(ALL) FROM {sobject}`
	 */
	query?: string;

	/**
	 * Optional: Operation to perform on target org
	 * - "Insert" (default)
	 * - "Upsert"
	 */
	operation?: 'Insert' | 'Upsert';

	/**
	 * Required if operation is "Upsert"
	 */
	externalId?: string;
}

