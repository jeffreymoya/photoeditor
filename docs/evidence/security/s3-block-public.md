# S3 Block Public Access Evidence

## Account-Level Configuration

### Verification Command
```bash
aws s3control get-public-access-block --account-id <ACCOUNT_ID>
```

### Required Settings
All four settings must be `true`:
- `BlockPublicAcls: true`
- `IgnorePublicAcls: true`
- `BlockPublicPolicy: true`
- `RestrictPublicBuckets: true`

### Last Verified
[TODO: Add timestamp]

### Screenshot
[TODO: Add screenshot of AWS Console showing account-level Block Public Access settings]

## Bucket-Level Configuration

### Temp Bucket
- **Bucket**: `[PROJECT]-[ENV]-temp`
- **Encryption**: SSE-S3 (AES256)
- **Public Access**: Blocked via account-level and bucket policy
- **Lifecycle**: Objects expire after 48 hours

### Final Bucket
- **Bucket**: `[PROJECT]-[ENV]-final`
- **Encryption**: SSE-KMS (Customer Managed Key)
- **Public Access**: Blocked via account-level and bucket policy
- **Versioning**: Enabled
- **Lifecycle**: Abort incomplete multipart uploads after 7 days

## Bucket Policies

### Temp Bucket Policy
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyPublicAccess",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::BUCKET_NAME",
        "arn:aws:s3:::BUCKET_NAME/*"
      ],
      "Condition": {
        "StringNotEquals": {
          "aws:PrincipalAccount": "ACCOUNT_ID"
        }
      }
    }
  ]
}
```

### Final Bucket Policy (with KMS enforcement)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUnencryptedObjectUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption": "aws:kms"
        }
      }
    },
    {
      "Sid": "DenyWrongKMSKey",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption-aws-kms-key-id": "arn:aws:kms:REGION:ACCOUNT_ID:key/KEY_ID"
        }
      }
    },
    {
      "Sid": "DenyPublicAccess",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::BUCKET_NAME",
        "arn:aws:s3:::BUCKET_NAME/*"
      ],
      "Condition": {
        "StringNotEquals": {
          "aws:PrincipalAccount": "ACCOUNT_ID"
        }
      }
    }
  ]
}
```

## Terraform Enforcement

### S3 Module Configuration
```hcl
resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

## CI/CD Validation

### Pre-Deployment Check
```bash
# Verify no buckets allow public access
aws s3api list-buckets --query 'Buckets[*].[Name]' --output text | \
while read bucket; do
  echo "Checking $bucket..."
  aws s3api get-bucket-acl --bucket "$bucket" --query 'Grants[?Grantee.URI==`http://acs.amazonaws.com/groups/global/AllUsers`]' --output text | \
  if [ -n "$(cat)" ]; then
    echo "FAIL: $bucket allows public access!"
    exit 1
  else
    echo "PASS: $bucket is private"
  fi
done
```

### tfsec Scan
Run `tfsec` to verify S3 bucket configurations:
```bash
tfsec infrastructure/ --format json > docs/evidence/terraform/policy-report.json
```

Expected: No HIGH or CRITICAL findings related to S3 public access.

## Last Updated
[TODO: Add date]

## Evidence Files
- [ ] Screenshot: Account-level Block Public Access settings
- [ ] Screenshot: Temp bucket settings
- [ ] Screenshot: Final bucket settings with KMS
- [ ] tfsec report with clean S3 findings
