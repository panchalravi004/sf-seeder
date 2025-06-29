# summary

Runs a data seeding plan to populate a Salesforce org with test data.

# description

This command reads a JSON-based seeding plan file and creates records in your specified Salesforce org. It's designed to help developers quickly populate sandboxes or scratch orgs with test data, supporting relationships between records by referencing previously created IDs.

# flags.target-org.summary

The username or alias of the Salesforce org to deploy data to.

# flags.target-org.description

This flag specifies the Salesforce organization where the data seeding plan will be executed. You can provide either the org's alias (e.g., `myDevOrg`) or its username (e.g., `testuser@example.com`).

# flags.dryrun.summary

Preview the data to be seeded without inserting into Salesforce.

# flags.save.summary

Save dry run output to a file (e.g., dryrun.json)

# flags.summaryonly.summary

'Show only object/field structure without sample data.'

# flags.plan.summary

The file path to the JSON data seeding plan.

# flags.plan.description

This flag requires the full or relative path to a JSON file that defines your data seeding plan. The file must exist and conform to the expected schema for seeding plans, specifying SObjects, record counts, field values, and options for referencing created records.

# examples

- `<%= config.bin %> <%= command.id %> --target-org myDevOrg --plan ./data/my-seeding-plan.json`

- `<%= config.bin %> <%= command.id %> -o test-sandbox -p ./data/sales-data-plan.json`
