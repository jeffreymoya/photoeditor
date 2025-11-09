# Changelog Entry: API Gateway Stage Deprecation Fix

**Date/Time:** 2025-10-02 23:27:03 UTC
**Agent:** Claude Code (Sonnet 4.5)
**Branch:** main
**Task:** TASK-0003 - Terraform: replace deprecated API Gateway stage_name

## Context

Fixed Terraform deprecation warning by removing the `stage_name` attribute from `aws_api_gateway_deployment` and creating an explicit `aws_api_gateway_stage` resource. This aligns with current AWS provider best practices and eliminates deprecation warnings.

## Summary

Successfully refactored API Gateway deployment configuration to use the recommended pattern of separating deployment and stage resources. The deprecated `stage_name` attribute on `aws_api_gateway_deployment` has been removed and replaced with a dedicated `aws_api_gateway_stage` resource.

## Changes Made

### infrastructure/main.tf:426-445
- Removed `stage_name = "dev"` from `aws_api_gateway_deployment.api_deployment`
- Added `lifecycle { create_before_destroy = true }` to deployment resource for safer updates
- Created new `aws_api_gateway_stage.dev` resource with:
  - `deployment_id` referencing the deployment
  - `rest_api_id` referencing the REST API
  - `stage_name = "dev"` properly configured

## Validation

### Commands Run
```bash
terraform fmt -recursive
# Result: No output (formatting successful)

terraform validate
# Result: Success! The configuration is valid.

rg -n 'stage_name' main.tf
# Result: 444:  stage_name    = "dev"
# Confirms stage_name only appears in aws_api_gateway_stage resource
```

### Manual Checks
- ✅ Verified `stage_name` removed from `aws_api_gateway_deployment`
- ✅ Verified `aws_api_gateway_stage` resource exists
- ✅ Terraform validation passes without warnings

## Acceptance Criteria Status
- ✅ `infrastructure/main.tf` no longer sets `stage_name` on deployment
- ✅ `aws_api_gateway_stage` resource exists with desired stage name
- ✅ `terraform validate` passes locally

## Pending/TODOs

None. Task completed successfully.

## Next Steps

TASK-0002 (Terraform: refactor main.tf to use modules) can now proceed as its blocker (TASK-0003) is completed.
