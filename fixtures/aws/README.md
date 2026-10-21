# AWS Fixtures

Fixtures captured from the AWS CLI for testing cloud services without requiring live AWS credentials or incurring API billing:

- `describe-instances.json`: Output from `aws ec2 describe-instances --output json`. Contains running and stopped instances with production/staging tags and IP addresses.
- `ce-cost-and-usage.json`: Output from `aws ce get-cost-and-usage --time-period ... --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE`.
