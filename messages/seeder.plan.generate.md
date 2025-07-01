# summary

Summary of a command.

# description

More information about a command. Don't repeat the summary.

# flags.target-org.summary

The username or alias of the Salesforce org to deploy data to.

# flags.target-org.description

This flag specifies the Salesforce organization where the data seeding plan will be executed. You can provide either the org's alias (e.g., `myDevOrg`) or its username (e.g., `testuser@example.com`).

# flags.objects.summary

Comma-separated list of objects to generate plan for

# flags.count.summary

Number of records per object

# flags.output.summary

Output file path for the generated plan

# examples

- <%= config.bin %> <%= command.id %>
