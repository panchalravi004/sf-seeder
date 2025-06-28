# summary

Validate the structure and references of a seeding plan.

# description

Checks your seeding plan file for structural correctness, invalid references, and required fields before running the seeder.

# flags.target-org.summary

The username or alias of the Salesforce org to deploy data to.

# flags.target-org.description

This flag specifies the Salesforce organization where the data seeding plan will be executed. You can provide either the org's alias (e.g., `myDevOrg`) or its username (e.g., `testuser@example.com`).

# flags.plan.summary

Path to the seeding plan file (JSON format).

# flags.validate-metadata.summary

Also validate sObject and field API names against the connected org.

# examples

- Validate you plan json structure without org metadata

  <%= config.bin %> <%= command.id %> --target-org MyDevORG -p ./seeding-plan.json

- Validate you plan json structure with org metadata

  <%= config.bin %> <%= command.id %> --target-org MyDevORG -p ./seeding-plan.json --validate-metadata
