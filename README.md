# 🌱 @ravi004/sf-seeder

A powerful Salesforce CLI plugin to seed data into your org using flexible, JSON-based data plans. Define your data relationships, use Faker for generating realistic values, reference records dynamically, and ensure your test orgs are always ready.

[![NPM](https://img.shields.io/npm/v/@ravi004/sf-seeder.svg?label=@ravi004/sf-seeder)](https://www.npmjs.com/package/@ravi004/sf-seeder) [![Downloads/week](https://img.shields.io/npm/dw/@ravi004/sf-seeder.svg)](https://npmjs.org/package/@ravi004/sf-seeder) [![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://opensource.org/license/apache-2-0)

---

## 📦 Installation

```bash
sf plugins install @ravi004/sf-seeder
```

---

## 🚀 Commands

### ▶️ `sf seeder:plan:run`

Run a seeding plan to insert dummy or mock data into a Salesforce org.

#### Flags

| Flag            | Type    | Required | Description                                      |
| --------------- | ------- | -------- | ------------------------------------------------ |
| `--target-org`  | org     | ✅       | Salesforce org alias or username                 |
| `--plan, -p`    | file    | ✅       | Path to JSON plan file                           |
| `--dryrun`      | boolean | ❌       | Run the plan without actual insertion            |
| `--save`        | string  | ❌       | File path to save dryrun output                  |
| `--summaryonly` | boolean | ❌       | Show only summary (must be used with `--dryrun`) |

#### Example

```bash
sf seeder:plan:run --target-org MYORG --plan ./my-first-plan.json --dryrun --save output.json
```

---

### ✅ `sf seeder:plan:validate`

Validate the structure and correctness of a seeding plan before executing.

#### Flags

| Flag                  | Type    | Required | Description                                         |
| --------------------- | ------- | -------- | --------------------------------------------------- |
| `--target-org`        | org     | ✅       | Salesforce org alias or username                    |
| `--plan, -p`          | file    | ✅       | Path to JSON plan file                              |
| `--validate-metadata` | boolean | ❌       | Validate field names and lookups using org metadata |

#### Example

```bash
sf seeder:plan:validate --target-org MYORG --plan ./my-first-plan.json
```

Use `--validate-metadata` to also validate against metadata.

---

### 🛠 `sf seeder:plan:generate`

Automatically generate a starter seeding plan for selected objects.

#### Flags

| Flag           | Type    | Required | Description                                     |
| -------------- | ------- | -------- | ----------------------------------------------- |
| `--target-org` | org     | ✅       | Salesforce org alias or username                |
| `--objects`    | string  | ✅       | Comma-separated list of SObjects to include     |
| `--count`      | integer | ❌       | Number of records per object (default: 3)       |
| `--output`     | string  | ❌       | Output file name (default: `seeding-plan.json`) |

#### Example

```bash
sf seeder:plan:generate --target-org MYORG --objects Opportunity,Contact --count 3 --output plan.json
```

---

### 📁 `sf seeder:data:migrate`

Migrate data from source ORG to target ORG for selected SOQL and sobject fields in SOQL.

#### Flags

| Flag               | Type | Required | Description                             |
| ------------------ | ---- | -------- | --------------------------------------- |
| `--source-org, -s` | org  | ✅       | Salesforce source org alias or username |
| `--target-org, -t` | org  | ✅       | Salesforce target org alias or username |
| `--plan, -p`       | file | ✅       | Path to JSON plan file                  |

#### Example

```bash
sf seeder:data:migrate --source-org MY_SOURCE_ORG --target-org MY_TARGET_ORG --plan plan.json
```

---

## 📄 Sample Seed Plan

```json
[
  {
    "sobject": "Account",
    "count": 1,
    "saveRefs": true,
    "fields": {
      "Name": "#{faker.company.name}",
      "Industry": "Technology",
      "AnnualRevenue": 50000000
    }
  },
  {
    "sobject": "Contact",
    "count": 1,
    "saveRefs": false,
    "fields": {
      "LastName": "User-#{counter}",
      "FirstName": "Test",
      "Email": "test.user.#{counter}@globaltech.demo",
      "AccountId": "@{Account.Id}"
    }
  },
  {
    "sobject": "Opportunity",
    "count": 1,
    "saveRefs": false,
    "fields": {
      "Name": "Major Deal #{counter}",
      "AccountId": "@{Account.Id}",
      "StageName": "Prospecting",
      "CloseDate": "2025-12-31",
      "Amount": 150000
    }
  }
]
```

## 📄 Sample Migrate Plan

```json
{
  "objects": [
    {
      "operation": "Upsert",
      "sobject": "Account",
      "query": "SELECT Id, Name, External_Id__c FROM Account LIMIT 2",
      "externalId": "External_Id__c"
    },
    {
      "sobject": "Contact", // Default Insert Operation
      "query": "SELECT Id, Name, Email FROM Contact LIMIT 2"
    }
  ]
}
```

---

## 🔧 Features

- 🌟 Supports dynamic values using [Faker.js](https://fakerjs.dev)
- 🔁 Use `#{counter}` to create unique values
- 🔗 Reference previously created records using `@{SObject.Field}`
- 🧪 Dryrun to preview changes
- ✅ Validate plan structure and fields
- ⚙️ Auto-generate seed plans with required lookups
- 📁 Migrate data between different Salesforce ORG

---

## 📚 Best Practices

- Use `--dryrun --summaryonly` together to quickly assess the impact.
- Validate your plan before running it with `plan:validate`.
- Use `saveRefs: true` in the plan to reference records between objects.
- Use `faker` for realistic test data and `#{counter}` for uniqueness.

---

Happy Seeding! 🌱✨
