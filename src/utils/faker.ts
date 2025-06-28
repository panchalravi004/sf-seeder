/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { faker } from '@faker-js/faker';

export function resolveFakerExpression(value: string, warn: (msg: string) => void): string | number | null {
    if (!value.startsWith('#{faker.') || !value.endsWith('}')) return null;

    try {
        const expression = value.slice(8, -1); // Remove #{faker. and trailing }
        const parts = expression.split('.');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        let result: any = faker as any;
        for (const part of parts) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (typeof result[part] === 'function') {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                result = result[part]();
            } else {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                result = result[part];
            }
            if (result === undefined || result === null) {
                warn(`Invalid faker path: ${expression}`);
                return null;
            }
        }

        if (typeof result === 'string' || typeof result === 'number') {
            return result;
        }

        return String(result);

    } catch (error) {
        return null;
    }
}

export function isValidFakerExpression(value: string): boolean {
    if (!value.startsWith('#{faker.') || !value.endsWith('}')) return false;

    try {
        const expression = value.slice(8, -1); // remove #{faker. and }
        const parts = expression.split('.');

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        let result: any = faker as any;

        for (const part of parts) {

            if (!(part in result)) return false;

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            result = result[part];
        }
        // If the final resolved thing is a function, it's usable
        return typeof result === 'function' || typeof result === 'string' || typeof result === 'number';
    } catch {
        return false;
    }
}

function findClosestMatch(input: string, candidates: string[]): string | null {
    let closest = null;
    let shortestDistance = Infinity;

    for (const candidate of candidates) {
        const distance = levenshteinDistance(input, candidate);
        if (distance < shortestDistance) {
            shortestDistance = distance;
            closest = candidate;
        }
    }

    return shortestDistance <= 5 ? closest : null;
}

function levenshteinDistance(a: string, b: string): number {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            dp[i][j] = Math.min(
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                dp[i - 1][j] + 1,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                dp[i][j - 1] + 1,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return dp[a.length][b.length];
}

export function suggestFakerAlternative(value: string): string | null {
    if (!value.startsWith('#{faker.') || !value.endsWith('}')) return null;

    try {
        const expression = value.slice(8, -1); // 'internet.fakeMail'
        const parts = expression.split('.');

        if (parts.length < 2) return null;

        const [rawSection, rawMethod] = parts;
        const sectionNames = Object.keys(faker);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        const section: any = (faker as any)[rawSection];

        if (!section || typeof section !== 'object') {
            const closestSection = findClosestMatch(rawSection, sectionNames);
            if (closestSection) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
                const validMethods = Object.keys((faker as any)[closestSection] ?? {});
                const closestMethod = findClosestMatch(rawMethod, validMethods);
                return closestMethod ? `#{faker.${closestSection}.${closestMethod}}` : null;
            }
            return null;
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const validMethods = Object.keys(section);
        if (!validMethods.includes(rawMethod)) {
            const closestMethod = findClosestMatch(rawMethod, validMethods);
            return closestMethod ? `#{faker.${rawSection}.${closestMethod}}` : null;
        }

        return null;

    } catch {
        return null;
    }
}