Workflow: Chromatic Visual Regression (#19361947293)
Title:    Merge pull request #5 from jeffreymoya/claude/task-cache-proposal-pha…
Branch:   main
Commit:   257a9b048701
Status:   failure
URL:      https://github.com/jeffreymoya/photoeditor/actions/runs/19361947293

Jobs:
  - chromatic (failure)
      - Run Chromatic: failure
      - Check accessibility with axe: skipped
      - Post Cache Skia binaries: skipped
      - Post Setup pnpm cache: skipped
      - Post Setup Node.js: skipped
      job URL: https://github.com/jeffreymoya/photoeditor/actions/runs/19361947293/job/55395782675

Failed Step Logs:
  ... (truncated to last 120 lines)
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.1598161Z .. postinstall: ✓ pnpm 8.15.9 ready
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.1600054Z .. postinstall: ✅ Corepack setup complete. Turbo parallel execution should now be stable.
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.1601218Z .. postinstall:    See TURBO_ISSUES.md for background on this fix.
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.1645489Z .. postinstall: Done
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.1647696Z .. prepare$ husky
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.2246151Z .. prepare: Done
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.2260845Z Done in 24.9s
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.2872117Z Dependencies installed successfully
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.2900332Z ##[group]Run pnpm run storybook:generate
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.2900677Z [36;1mpnpm run storybook:generate[0m
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.2927080Z shell: /usr/bin/bash -e {0}
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.2927319Z env:
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.2927547Z   PNPM_HOME: /home/runner/setup-pnpm/node_modules/.bin
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.2927827Z ##[endgroup]
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.7351938Z 
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.7353067Z > photoeditor-mobile@1.0.0 storybook:generate /home/runner/work/photoeditor/photoeditor/mobile
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.7353713Z > sb-rn-get-stories
  chromatic	UNKNOWN STEP	2025-11-14T10:37:32.7353869Z 
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.2511077Z ##[group]Run chromaui/action@v1
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.2511333Z with:
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.2511496Z   workingDir: mobile
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.2511700Z   buildScriptName: storybook:web
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.2511928Z   exitZeroOnChanges: true
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.2512136Z   exitOnceUploaded: true
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.2512333Z env:
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.2512548Z   PNPM_HOME: /home/runner/setup-pnpm/node_modules/.bin
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.2512825Z ##[endgroup]
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.8883180Z 
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.8967547Z 10:37:33.896 Chromatic CLI v11.27.0
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.8968412Z              https://www.chromatic.com/docs/cli
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.8968764Z 
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.8982770Z 
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9011546Z 10:37:33.900 ✖ Missing project token
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9011873Z              
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9012298Z              Sign in to https://www.chromatic.com/start and create a new project,
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9013010Z              or find your project token on the Manage screen in an existing project.
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9013770Z              Set your project token as the CHROMATIC_PROJECT_TOKEN environment variable
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9014363Z              or pass the --project-token command line option.
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9014720Z              
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9015146Z              ℹ Read more at https://www.chromatic.com/docs/setup
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9015634Z              → View the full stacktrace below
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9015944Z              
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9016476Z              If you need help, please chat with us at https://www.chromatic.com/docs/cli for the fastest response.
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9017234Z              You can also email the team at support@chromatic.com if chat is not an option.
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9017675Z              
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9018290Z              Please provide us with the above CLI output and the following info:
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9018707Z              {
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9019005Z                "timestamp": "2025-11-14T10:37:33.898Z",
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9019767Z                "sessionId": "31f57f0c-2abb-4e47-85c4-e99fcb2e615f",
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9020175Z                "nodePlatform": "linux",
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9020516Z                "nodeVersion": "20.19.5",
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9020864Z                "packageName": "chromatic",
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9021214Z                "packageVersion": "11.27.0",
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9021521Z                "flags": {
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9021836Z                  "allowConsoleErrors": false,
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9022219Z                  "buildScriptName": "storybook:web",
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9022605Z                  "exitOnceUploaded": true,
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9022926Z                  "exitZeroOnChanges": true,
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9023203Z                  "externals": [],
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9023465Z                  "fileHashing": true,
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9023736Z                  "interactive": false,
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9024005Z                  "onlyStoryFiles": [],
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9024287Z                  "onlyStoryNames": [],
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9024561Z                  "skipUpdateCheck": false,
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9024843Z                  "untraced": [],
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9025246Z                  "uploadMetadata": false,
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9025659Z                  "zip": false
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9025995Z                },
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9026316Z                "extraOptions": {
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9026732Z                  "inAction": true
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9027049Z                },
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9027335Z                "configuration": {},
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9027766Z                "errorType": "Error",
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9028583Z                "errorMessage": "✖ Missing project token"
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9029015Z              }
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9029187Z              
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9029467Z              Error: ✖ Missing project token
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9029708Z              
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9030269Z              Sign in to https://www.chromatic.com/start and create a new project,
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9030809Z              or find your project token on the Manage screen in an existing project.
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9031338Z              Set your project token as the CHROMATIC_PROJECT_TOKEN environment variable
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9031797Z              or pass the --project-token command line option.
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9032087Z              
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9032409Z              ℹ Read more at https://www.chromatic.com/docs/setup
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9032932Z                  at hPe (/home/runner/work/_actions/chromaui/action/v1/action/register.js:357:3102)
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9033541Z                  at VTa (/home/runner/work/_actions/chromaui/action/v1/action/register.js:1756:1462)
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9034170Z                  at async orn (/home/runner/work/_actions/chromaui/action/v1/action/register.js:1756:367)
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9035201Z                  at async zTa (/home/runner/work/_actions/chromaui/action/v1/action/register.js:1756:4804)
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9058986Z ##[error]non-zero exit code
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9203090Z ##[group]Run actions/upload-artifact@v4
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9203365Z with:
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9203538Z   name: chromatic-results
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9203793Z   path: mobile/chromatic-build-*.log
  chromatic	UNKNOWN STEP	mobile/.chromatic
  chromatic	UNKNOWN STEP	
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9204075Z   retention-days: 30
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9204321Z   if-no-files-found: warn
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9204531Z   compression-level: 6
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9204720Z   overwrite: false
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9204919Z   include-hidden-files: false
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9205129Z env:
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9205333Z   PNPM_HOME: /home/runner/setup-pnpm/node_modules/.bin
  chromatic	UNKNOWN STEP	2025-11-14T10:37:33.9205607Z ##[endgroup]
  chromatic	UNKNOWN STEP	2025-11-14T10:37:34.1442128Z ##[warning]No files were found with the provided path: mobile/chromatic-build-*.log
  chromatic	UNKNOWN STEP	mobile/.chromatic. No artifacts will be uploaded.
  chromatic	UNKNOWN STEP	2025-11-14T10:37:34.1539731Z Post job cleanup.
  chromatic	UNKNOWN STEP	2025-11-14T10:37:34.2462489Z Pruning is unnecessary.
  chromatic	UNKNOWN STEP	2025-11-14T10:37:34.2561011Z Post job cleanup.
  chromatic	UNKNOWN STEP	2025-11-14T10:37:34.3547221Z [command]/usr/bin/git version
  chromatic	UNKNOWN STEP	2025-11-14T10:37:34.3584164Z git version 2.51.2
  chromatic	UNKNOWN STEP	2025-11-14T10:37:34.3631577Z Temporarily overriding HOME='/home/runner/work/_temp/0054f145-c32b-48fb-93d6-fed146153ed1' before making global git config changes
  chromatic	UNKNOWN STEP	2025-11-14T10:37:34.3633077Z Adding repository directory to the temporary git global config as a safe directory
  chromatic	UNKNOWN STEP	2025-11-14T10:37:34.3645724Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/photoeditor/photoeditor
  chromatic	UNKNOWN STEP	2025-11-14T10:37:34.3683264Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
  chromatic	UNKNOWN STEP	2025-11-14T10:37:34.3717871Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
  chromatic	UNKNOWN STEP	2025-11-14T10:37:34.3956765Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
  chromatic	UNKNOWN STEP	2025-11-14T10:37:34.3979781Z http.https://github.com/.extraheader
  chromatic	UNKNOWN STEP	2025-11-14T10:37:34.3992593Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
  chromatic	UNKNOWN STEP	2025-11-14T10:37:34.4024490Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
  chromatic	UNKNOWN STEP	2025-11-14T10:37:34.4364054Z Cleaning up orphan processes

--------------------------------------------------------------------------------

Workflow: .github/workflows/ci-cd.yml (#19361946910)
Title:    Merge pull request #5 from jeffreymoya/claude/task-cache-proposal-pha…
Branch:   main
Commit:   257a9b048701
Status:   failure
URL:      https://github.com/jeffreymoya/photoeditor/actions/runs/19361946910

Jobs: Unable to load job metadata (no jobs returned).

Failed Step Logs:
  Unable to load failed logs: failed to get run log: log not found

--------------------------------------------------------------------------------

Workflow: Chromatic Visual Regression (#19359835452)
Title:    Merge pull request #4 from jeffreymoya/claude/fix-pr-checks-019zZG5D1…
Branch:   main
Commit:   621b19fa8a42
Status:   failure
URL:      https://github.com/jeffreymoya/photoeditor/actions/runs/19359835452

Jobs:
  - chromatic (failure)
      - Run Chromatic: failure
      - Check accessibility with axe: skipped
      - Post Cache Skia binaries: skipped
      - Post Setup pnpm cache: skipped
      - Post Setup Node.js: skipped
      job URL: https://github.com/jeffreymoya/photoeditor/actions/runs/19359835452/job/55388913357

Failed Step Logs:
  ... (truncated to last 120 lines)
  chromatic	UNKNOWN STEP	2025-11-14T09:13:07.5918967Z .. postinstall: ✓ pnpm 8.15.9 ready
  chromatic	UNKNOWN STEP	2025-11-14T09:13:07.5920336Z .. postinstall: ✅ Corepack setup complete. Turbo parallel execution should now be stable.
  chromatic	UNKNOWN STEP	2025-11-14T09:13:07.5921361Z .. postinstall:    See TURBO_ISSUES.md for background on this fix.
  chromatic	UNKNOWN STEP	2025-11-14T09:13:07.5963121Z .. postinstall: Done
  chromatic	UNKNOWN STEP	2025-11-14T09:13:07.5965192Z .. prepare$ husky
  chromatic	UNKNOWN STEP	2025-11-14T09:13:07.6540728Z .. prepare: Done
  chromatic	UNKNOWN STEP	2025-11-14T09:13:07.6554125Z Done in 26.2s
  chromatic	UNKNOWN STEP	2025-11-14T09:13:07.7127508Z Dependencies installed successfully
  chromatic	UNKNOWN STEP	2025-11-14T09:13:07.7153524Z ##[group]Run pnpm run storybook:generate
  chromatic	UNKNOWN STEP	2025-11-14T09:13:07.7153856Z [36;1mpnpm run storybook:generate[0m
  chromatic	UNKNOWN STEP	2025-11-14T09:13:07.7180232Z shell: /usr/bin/bash -e {0}
  chromatic	UNKNOWN STEP	2025-11-14T09:13:07.7180461Z env:
  chromatic	UNKNOWN STEP	2025-11-14T09:13:07.7180686Z   PNPM_HOME: /home/runner/setup-pnpm/node_modules/.bin
  chromatic	UNKNOWN STEP	2025-11-14T09:13:07.7180980Z ##[endgroup]
  chromatic	UNKNOWN STEP	2025-11-14T09:13:08.1611251Z 
  chromatic	UNKNOWN STEP	2025-11-14T09:13:08.1612370Z > photoeditor-mobile@1.0.0 storybook:generate /home/runner/work/photoeditor/photoeditor/mobile
  chromatic	UNKNOWN STEP	2025-11-14T09:13:08.1612897Z > sb-rn-get-stories
  chromatic	UNKNOWN STEP	2025-11-14T09:13:08.1613024Z 
  chromatic	UNKNOWN STEP	2025-11-14T09:13:08.6765653Z ##[group]Run chromaui/action@v1
  chromatic	UNKNOWN STEP	2025-11-14T09:13:08.6766225Z with:
  chromatic	UNKNOWN STEP	2025-11-14T09:13:08.6766471Z   workingDir: mobile
  chromatic	UNKNOWN STEP	2025-11-14T09:13:08.6766786Z   buildScriptName: storybook:web
  chromatic	UNKNOWN STEP	2025-11-14T09:13:08.6767150Z   exitZeroOnChanges: true
  chromatic	UNKNOWN STEP	2025-11-14T09:13:08.6767492Z   exitOnceUploaded: true
  chromatic	UNKNOWN STEP	2025-11-14T09:13:08.6767814Z env:
  chromatic	UNKNOWN STEP	2025-11-14T09:13:08.6768160Z   PNPM_HOME: /home/runner/setup-pnpm/node_modules/.bin
  chromatic	UNKNOWN STEP	2025-11-14T09:13:08.6768601Z ##[endgroup]
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.2943238Z 
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3033271Z 09:13:09.302 Chromatic CLI v11.27.0
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3033948Z              https://www.chromatic.com/docs/cli
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3034284Z 
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3050106Z 
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3079709Z 09:13:09.307 ✖ Missing project token
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3080198Z              
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3080784Z              Sign in to https://www.chromatic.com/start and create a new project,
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3081732Z              or find your project token on the Manage screen in an existing project.
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3082623Z              Set your project token as the CHROMATIC_PROJECT_TOKEN environment variable
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3083427Z              or pass the --project-token command line option.
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3083895Z              
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3084543Z              ℹ Read more at https://www.chromatic.com/docs/setup
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3085238Z              → View the full stacktrace below
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3085661Z              
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3086635Z              If you need help, please chat with us at https://www.chromatic.com/docs/cli for the fastest response.
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3087684Z              You can also email the team at support@chromatic.com if chat is not an option.
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3088303Z              
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3088885Z              Please provide us with the above CLI output and the following info:
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3089467Z              {
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3089910Z                "timestamp": "2025-11-14T09:13:09.305Z",
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3090526Z                "sessionId": "37f3cd64-2cb3-491a-9f44-1db1e3e54b3e",
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3091460Z                "nodePlatform": "linux",
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3091953Z                "nodeVersion": "20.19.5",
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3092464Z                "packageName": "chromatic",
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3092974Z                "packageVersion": "11.27.0",
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3093417Z                "flags": {
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3093847Z                  "allowConsoleErrors": false,
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3094389Z                  "buildScriptName": "storybook:web",
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3094942Z                  "exitOnceUploaded": true,
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3095455Z                  "exitZeroOnChanges": true,
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3096149Z                  "externals": [],
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3096626Z                  "fileHashing": true,
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3097099Z                  "interactive": false,
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3097576Z                  "onlyStoryFiles": [],
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3098081Z                  "onlyStoryNames": [],
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3098564Z                  "skipUpdateCheck": false,
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3099019Z                  "untraced": [],
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3099321Z                  "uploadMetadata": false,
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3099565Z                  "zip": false
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3099918Z                },
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3100263Z                "extraOptions": {
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3100669Z                  "inAction": true
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3101013Z                },
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3101345Z                "configuration": {},
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3101787Z                "errorType": "Error",
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3102443Z                "errorMessage": "✖ Missing project token"
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3102902Z              }
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3103101Z              
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3103366Z              Error: ✖ Missing project token
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3103601Z              
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3104168Z              Sign in to https://www.chromatic.com/start and create a new project,
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3104680Z              or find your project token on the Manage screen in an existing project.
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3105161Z              Set your project token as the CHROMATIC_PROJECT_TOKEN environment variable
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3105584Z              or pass the --project-token command line option.
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3106052Z              
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3106427Z              ℹ Read more at https://www.chromatic.com/docs/setup
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3106925Z                  at hPe (/home/runner/work/_actions/chromaui/action/v1/action/register.js:357:3102)
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3107480Z                  at VTa (/home/runner/work/_actions/chromaui/action/v1/action/register.js:1756:1462)
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3108042Z                  at async orn (/home/runner/work/_actions/chromaui/action/v1/action/register.js:1756:367)
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3108918Z                  at async zTa (/home/runner/work/_actions/chromaui/action/v1/action/register.js:1756:4804)
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3131642Z ##[error]non-zero exit code
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3268131Z ##[group]Run actions/upload-artifact@v4
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3268402Z with:
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3268577Z   name: chromatic-results
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3268831Z   path: mobile/chromatic-build-*.log
  chromatic	UNKNOWN STEP	mobile/.chromatic
  chromatic	UNKNOWN STEP	
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3269120Z   retention-days: 30
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3269301Z   if-no-files-found: warn
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3269495Z   compression-level: 6
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3269672Z   overwrite: false
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3269855Z   include-hidden-files: false
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3270051Z env:
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3270255Z   PNPM_HOME: /home/runner/setup-pnpm/node_modules/.bin
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.3270524Z ##[endgroup]
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.5521497Z ##[warning]No files were found with the provided path: mobile/chromatic-build-*.log
  chromatic	UNKNOWN STEP	mobile/.chromatic. No artifacts will be uploaded.
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.5618246Z Post job cleanup.
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.6532907Z Pruning is unnecessary.
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.6641838Z Post job cleanup.
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.7614583Z [command]/usr/bin/git version
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.7651245Z git version 2.51.2
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.7697000Z Temporarily overriding HOME='/home/runner/work/_temp/617675be-4e55-413a-8958-23f123ef63fb' before making global git config changes
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.7698436Z Adding repository directory to the temporary git global config as a safe directory
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.7711580Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/photoeditor/photoeditor
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.7747966Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.7780313Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.8013260Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.8035677Z http.https://github.com/.extraheader
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.8049377Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.8080545Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
  chromatic	UNKNOWN STEP	2025-11-14T09:13:09.8418529Z Cleaning up orphan processes

--------------------------------------------------------------------------------

Workflow: .github/workflows/ci-cd.yml (#19359835126)
Title:    Merge pull request #4 from jeffreymoya/claude/fix-pr-checks-019zZG5D1…
Branch:   main
Commit:   621b19fa8a42
Status:   failure
URL:      https://github.com/jeffreymoya/photoeditor/actions/runs/19359835126

Jobs: Unable to load job metadata (no jobs returned).

Failed Step Logs:
  Unable to load failed logs: failed to get run log: log not found

--------------------------------------------------------------------------------

Workflow: Chromatic Visual Regression (#19359734187)
Title:    Merge pull request #3 from jeffreymoya/claude/analyze-task-context-ca…
Branch:   main
Commit:   a12d0d48b4e9
Status:   failure
URL:      https://github.com/jeffreymoya/photoeditor/actions/runs/19359734187

Jobs:
  - chromatic (failure)
      - Set up job: failure
      job URL: https://github.com/jeffreymoya/photoeditor/actions/runs/19359734187/job/55388592324

Failed Step Logs:
  chromatic	UNKNOWN STEP	﻿2025-11-14T09:08:26.6573089Z Current runner version: '2.329.0'
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6596759Z ##[group]Runner Image Provisioner
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6597560Z Hosted Compute Agent
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6598136Z Version: 20251016.436
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6598768Z Commit: 8ab8ac8bfd662a3739dab9fe09456aba92132568
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6599447Z Build Date: 2025-10-15T20:44:12Z
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6600078Z ##[endgroup]
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6600813Z ##[group]Operating System
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6601402Z Ubuntu
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6601844Z 22.04.5
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6602386Z LTS
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6602862Z ##[endgroup]
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6603647Z ##[group]Runner Image
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6604315Z Image: ubuntu-22.04
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6604801Z Version: 20251102.127.1
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6605826Z Included Software: https://github.com/actions/runner-images/blob/ubuntu22/20251102.127/images/ubuntu/Ubuntu2204-Readme.md
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6607392Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu22%2F20251102.127
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6608502Z ##[endgroup]
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6609522Z ##[group]GITHUB_TOKEN Permissions
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6611823Z Contents: read
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6612486Z Metadata: read
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6613025Z Packages: read
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6613534Z ##[endgroup]
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6615892Z Secret source: Actions
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6616953Z Prepare workflow directory
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.6999302Z Prepare all required actions
  chromatic	UNKNOWN STEP	2025-11-14T09:08:26.7036759Z Getting action download info
  chromatic	UNKNOWN STEP	2025-11-14T09:08:27.0835638Z ##[error]This request has been automatically failed because it uses a deprecated version of `actions/upload-artifact: v3`. Learn more: https://github.blog/changelog/2024-04-16-deprecation-notice-v3-of-the-artifact-actions/
