# Provider Swap Demo Guide

This document demonstrates how to swap analysis and editing providers without code changes using AWS SSM Parameter Store.

## Overview

The provider selection system uses SSM parameters to determine which analysis and editing providers to use at runtime. This allows for easy provider switching through configuration changes only.

## SSM Parameters

The system uses the following SSM parameters:

- `/<PROJECT>-<ENV>/providers/analysis` - Name of the analysis provider (default: `gemini`)
- `/<PROJECT>-<ENV>/providers/editing` - Name of the editing provider (default: `seedream`)
- `/<PROJECT>-<ENV>/providers/enable-stubs` - Enable stub providers for testing (default: `false`)

## Available Providers

### Analysis Providers
- `gemini` - Google Gemini Vision API (default)

### Editing Providers
- `seedream` - Seedream Image Editing API (default)

### Stub Providers
When `providers/enable-stubs` is set to `true`, both analysis and editing will use stub implementations for testing purposes.

## Swapping Providers

### Prerequisites
- AWS CLI configured with appropriate credentials
- Access to SSM Parameter Store in the target environment
- Valid API keys configured for the providers you want to use

### Step 1: View Current Configuration

```bash
# Check current analysis provider
aws ssm get-parameter --name "/<PROJECT>-<ENV>/providers/analysis" --region <REGION>

# Check current editing provider
aws ssm get-parameter --name "/<PROJECT>-<ENV>/providers/editing" --region <REGION>
```

### Step 2: Update Provider Selection

To change providers, simply update the SSM parameter values:

```bash
# Example: Keep using Gemini for analysis
aws ssm put-parameter \
  --name "/<PROJECT>-<ENV>/providers/analysis" \
  --value "gemini" \
  --type String \
  --overwrite \
  --region <REGION>

# Example: Keep using Seedream for editing
aws ssm put-parameter \
  --name "/<PROJECT>-<ENV>/providers/editing" \
  --value "seedream" \
  --type String \
  --overwrite \
  --region <REGION>
```

### Step 3: Restart Application

After updating the parameters, restart your Lambda functions or application to pick up the new configuration:

```bash
# For Lambda functions, you can update the function configuration to trigger a restart
aws lambda update-function-configuration \
  --function-name <FUNCTION_NAME> \
  --environment Variables={FORCE_RESTART=true} \
  --region <REGION>
```

### Step 4: Verify Provider Selection

Check the application logs to verify the correct providers are being used:

```bash
# Check CloudWatch logs for provider initialization
aws logs tail /aws/lambda/<FUNCTION_NAME> --follow --region <REGION>
```

Look for log entries indicating which providers were initialized.

## Using Stub Providers for Testing

To enable stub providers for testing:

```bash
# Enable stubs
aws ssm put-parameter \
  --name "/<PROJECT>-<ENV>/providers/enable-stubs" \
  --value "true" \
  --type String \
  --overwrite \
  --region <REGION>

# Disable stubs (return to real providers)
aws ssm put-parameter \
  --name "/<PROJECT>-<ENV>/providers/enable-stubs" \
  --value "false" \
  --type String \
  --overwrite \
  --region <REGION>
```

When stubs are enabled, the system ignores the `providers/analysis` and `providers/editing` parameters and uses stub implementations instead.

## Default Behavior

If the SSM parameters are not set, the system uses these defaults:
- Analysis provider: `gemini`
- Editing provider: `seedream`
- Stubs enabled: `false`

## Error Handling

The system validates provider names and will throw an error if:
- An invalid provider name is specified
- Required API keys are missing from SSM
- SSM parameters cannot be accessed

Error messages clearly indicate the issue and list valid provider options.

## Local Development

For local development, you can either:

1. **Use LocalStack**: Set up SSM parameters in LocalStack
   ```bash
   aws --endpoint-url=http://localhost:4566 ssm put-parameter \
     --name "/<PROJECT>-dev/providers/analysis" \
     --value "gemini" \
     --type String
   ```

2. **Use Stub Providers**: Enable stubs for testing without external dependencies
   ```bash
   aws --endpoint-url=http://localhost:4566 ssm put-parameter \
     --name "/<PROJECT>-dev/providers/enable-stubs" \
     --value "true" \
     --type String
   ```

## Implementation Details

The provider selection logic is implemented in:
- `backend/src/services/config.service.ts` - Fetches provider names from SSM
- `backend/src/services/bootstrap.service.ts` - Initializes providers based on SSM configuration
- `backend/src/providers/factory.ts` - Creates provider instances

The system follows these steps:
1. Check if stub providers are enabled
2. If not, fetch provider names from SSM (with defaults)
3. Validate provider names against allowed values
4. Fetch provider-specific configuration (API keys, endpoints)
5. Initialize the provider factory with the selected providers

## Benefits

This design provides:
- **Zero code changes** for provider swapping
- **Environment-specific configuration** through SSM
- **Safe defaults** if parameters are missing
- **Clear validation** with helpful error messages
- **Easy testing** with stub providers
