/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { Connection } from '@salesforce/core';
import { FieldValue, SeedingStep } from '../types/index.js';
import { isValidFakerExpression, suggestFakerAlternative } from './faker.js';

export async function validateMetadata(
    plan: SeedingStep[],
    conn: Connection,
    log: (msg: string) => void,
    warn: (msg: string) => void
): Promise<boolean> {
    let hasError = false;

    const referenceMap = new Map<string, boolean>();
    const prefixMap = new Map<string, string>();
    const describedObjects = new Map<string, unknown>();

    plan.forEach((step) => {
        if (step.saveRefs) referenceMap.set(step.sobject, true);
    });

    for (const [index, step] of plan.entries()) {
        let objectDescribe;
        try {
            // eslint-disable-next-line no-await-in-loop
            objectDescribe = await conn.describe(step.sobject);
            describedObjects.set(step.sobject, objectDescribe);
            if (objectDescribe.keyPrefix) {
                prefixMap.set(objectDescribe.keyPrefix, objectDescribe.name);
            }
        } catch (err) {
            warn(`Step ${index + 1}: SObject "${step.sobject}" does not exist in org.`);
            hasError = true;
            continue;
        }

        // log(JSON.stringify([...new Set(objectDescribe.fields.map((f) => f.type))]));

        for (const [field, value] of Object.entries(step.fields)) {
            const fieldMeta = objectDescribe.fields.find((f) => f.name === field);

            if (!fieldMeta) {
                warn(`Step ${index + 1}: Field "${field}" does not exist on ${step.sobject}`);
                hasError = true;
            } else {
                for (const objName of fieldMeta.referenceTo ?? []) {
                    if (!describedObjects.has(objName)) {
                        try {
                            // eslint-disable-next-line no-await-in-loop
                            const desc = await conn.describe(objName);
                            describedObjects.set(objName, desc);
                            if (desc.keyPrefix) {
                                prefixMap.set(desc.keyPrefix, desc.name);
                            }
                        } catch (err) {
                            warn(`Step ${index + 1}: Could not describe "${objName}" for ID validation.`);
                        }
                    }
                }

                const valid = validateFieldValueType(
                    `Step ${index + 1}`,
                    field,
                    value,
                    fieldMeta.type,
                    fieldMeta.referenceTo ?? [],
                    prefixMap,
                    warn
                );

                if (!valid) {
                    hasError = true;
                }
            }
        }
    }

    return !hasError;
}

export function validatePlanStructure(plan: SeedingStep[], warn: (msg: string) => void): boolean {
    let hasError = false;

    const referenceMap = new Map<string, boolean>();
    plan.forEach((step) => {
        if (step.saveRefs) referenceMap.set(step.sobject, true);
    });

    for (const [index, step] of plan.entries()) {
        if (!step.sobject || typeof step.sobject !== 'string') {
            warn(`Step ${index + 1}: Missing or invalid "sobject"`);
            hasError = true;
        }

        if (!step.count || typeof step.count !== 'number') {
            warn(`Step ${index + 1}: Missing or invalid "count"`);
            hasError = true;
        }

        if (!step.fields || typeof step.fields !== 'object') {
            warn(`Step ${index + 1}: Missing or invalid "fields"`);
            hasError = true;
        } else {
            Object.keys(step.fields).forEach((field) => {
                const value = step.fields[field];

                if (typeof value === 'string' && value.startsWith('@{') && value.endsWith('}')) {
                    const [refObj, refField] = value.slice(2, -1).split('.');
                    if (!refObj || !refField) {
                        warn(`Step ${index + 1}: Invalid reference "${value}"`);
                        hasError = true;
                    } else if (!referenceMap.has(refObj)) {
                        warn(`Step ${index + 1}: Reference "${refObj}" not found in plan.`);
                        hasError = true;
                    }
                }

                // Replace #{faker.*.*}
                if (typeof value === 'string' && value.startsWith('#{faker.') && value.endsWith('}')) {
                    if (!isValidFakerExpression(value)) {
                        let message = `Step ${index + 1}: Field "${field}" has invalid faker expression: "${value}"`;

                        const suggestion = suggestFakerAlternative(value);
                        if (suggestion) {
                            message += `\n  👉 Did you mean: "${suggestion}"?`;
                        }

                        warn(message);
                        hasError = true;
                    }
                }
            });
        }
    }

    return !hasError;
}

export function validateFieldValueType(
    step: string,
    field: string,
    value: FieldValue,
    type: string,
    referenceTo: string[],
    prefixMap: Map<string, string>,
    warn: (msg: string) => void
): boolean {
    if (value === null) return true;

    const valueStr = String(value);

    switch (type) {
        case 'boolean':
            if (typeof value !== 'boolean') {
                warn(`${step}: Field "${field}" must be a boolean.`);
                return false;
            }
            break;
        case 'int':
            if (!Number.isInteger(value)) {
                warn(`${step}: Field "${field}" must be an integer.`);
                return false;
            }
            break;
        case 'double':
        case 'currency':
            if (typeof value !== 'number') {
                warn(`${step}: Field "${field}" must be a number.`);
                return false;
            }
            break;
        case 'date':
            if (!/^\d{4}-\d{2}-\d{2}$/.test(valueStr)) {
                warn(`${step}: Field "${field}" must be a valid Date (YYYY-MM-DD).`);
                return false;
            }
            break;
        case 'datetime':
            if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(valueStr)) {
                warn(`${step}: Field "${field}" must be a valid DateTime (YYYY-MM-DDTHH:MM:SSZ).`);
                return false;
            }
            break;
        case 'reference':
            return validateReference(step, field, valueStr, referenceTo, prefixMap, warn);
    }

    return true;
}

function validateReference(
    step: string,
    field: string,
    value: string,
    referenceTo: string[],
    prefixMap: Map<string, string>,
    warn: (msg: string) => void
): boolean {
    if (value.startsWith('@{') && value.endsWith('}')) {
        const refObj = value.slice(2, -1).split('.')[0];
        if (!referenceTo.includes(refObj)) {
            warn(`${step}: Invalid reference on field "${field}". Expected ${referenceTo.join(', ')}`);
            return false;
        }
        return true;
    }

    // Static ID case: Validate 15 or 18 char
    if (/^[a-zA-Z0-9]{15,18}$/.test(value)) {
        // Optionally: You can add conn.tooling.query() call here to validate object type via ID prefix
        const prefix = value.slice(0, 3);

        const objectName = prefixMap.get(prefix);

        if (!objectName || !referenceTo.includes(objectName)) {
            warn(`${step}: Static ID "${value}" does not belong to expected reference type(s): ${referenceTo.join(', ')}`);
            return false;
        }

        return true;
    }

    warn(`${step}: Invalid reference format on field "${field}".`);
    return false;
}

// function frequency(arr: unknown[], item: unknown): number {
//     return arr.reduce((count: number, x: unknown) => x === item ? count + 1 : count, 0);
// };
