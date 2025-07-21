# summary

Summary of a command.

# description

More information about a command. Don't repeat the summary.

# flags.target-org.summary

The username or alias of the Salesforce org to deploy data.

# flags.target-org.description

This flag specifies the Salesforce organization where the data seeding plan will be executed. You can provide either the org's alias (e.g., `myDevOrg`) or its username (e.g., `testuser@example.com`).

# flags.source-org.summary

The username or alias of the Salesforce org to retrieve data.

# flags.source-org.description

This flag specifies the Salesforce organization where the data seeding plan will be retrieve data. You can provide either the org's alias (e.g., `myDevOrg`) or its username (e.g., `testuser@example.com`).

# flags.plan.summary

The file path to the JSON data seeding plan.

# flags.plan.description

This flag requires the full or relative path to a JSON file that defines your data seeding plan. The file must exist and conform to the expected schema for seeding plans, specifying SObjects, record counts, field values, and options for referencing created records.

# examples

- `<%= config.bin %> <%= command.id %> --source-org mySourceOrg --target-org myTargetOrg --plan ./data/my-seeding-plan.json`
