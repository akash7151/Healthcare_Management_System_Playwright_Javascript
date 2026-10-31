// Healthcare Management — checks, Playwright, and an approval-gated staging deploy.
//
// Node.js LTS is the machine-wide install at C:\Program Files\nodejs. The NodeJS
// Jenkins plugin is not installed, and this Jenkins service process does not
// have that directory on PATH. On Windows the Node.js stage prepends it
// (override with NODE_HOME). Linux agents use node/npm already on PATH.
//
// Prefer Pipeline from SCM pointed at the deployment/staging branch.
// If this job has no SCM remote, the Checkout stage copies HEALTHCARE_WORKSPACE
// (default D:\Healthcare Management). node_modules, .git, dist, Playwright auth
// state, and report output are not copied. backend/.env in that tree supplies
// DATABASE_URL for the local Playwright webServer. Do not archive or commit it.
//
// Staging deploy is skipped unless DEPLOY_STAGING is true and DEPLOY_CONFIRMATION
// is exactly deploy-staging. The stage then waits for a manual approval and
// calls the Render deploy hook. It does not run destructive database commands.
// Pull requests are refused. There is no production deploy stage.

pipeline {
  agent any

  parameters {
    string(
      name: 'HEALTHCARE_WORKSPACE',
      defaultValue: 'D:\\Healthcare Management',
      description: 'Project directory to copy when this job has no SCM remote. Ignored when package.json is already in the workspace.'
    )
    booleanParam(
      name: 'RUN_BACKEND_TESTS',
      defaultValue: false,
      description: 'Run Vitest against TEST_DATABASE_URL from the healthcare-test-database-url credential. Leave off until that credential exists.'
    )
    booleanParam(
      name: 'RUN_STAGING_SMOKE',
      defaultValue: false,
      description: 'Run the Playwright smoke project against the staging URLs stored in Jenkins credentials.'
    )
    booleanParam(
      name: 'DEPLOY_STAGING',
      defaultValue: false,
      description: 'Arm the staging deploy stage. This still requires DEPLOY_CONFIRMATION and a manual approval. Leave off until the cloud accounts exist.'
    )
    string(
      name: 'DEPLOY_CONFIRMATION',
      defaultValue: '',
      description: 'Type deploy-staging to arm the deploy stage. Leave blank for ordinary builds.'
    )
  }

  environment {
    CI = 'true'
  }

  options {
    timeout(time: 90, unit: 'MINUTES')
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '10'))
    disableConcurrentBuilds()
  }

  stages {
    stage('Checkout') {
      steps {
        script {
          if (env.CHANGE_ID && params.DEPLOY_STAGING) {
            error 'Refusing to deploy from a pull request.'
          }
          def haveProject = fileExists('package.json') && fileExists('playwright.config.js')
          if (!haveProject) {
            try {
              checkout scm
            } catch (err) {
              echo "SCM checkout is not configured for this job: ${err}"
            }
            haveProject = fileExists('package.json') && fileExists('playwright.config.js')
          }

          if (haveProject) {
            echo "Using project files in ${pwd()}."
          } else {
            def source = ''
            if (params.HEALTHCARE_WORKSPACE) {
              source = params.HEALTHCARE_WORKSPACE.trim()
            }
            if (!source && env.HEALTHCARE_WORKSPACE) {
              source = env.HEALTHCARE_WORKSPACE.trim()
            }
            if (!source && !isUnix()) {
              source = 'D:\\Healthcare Management'
            }
            if (!source) {
              error 'No SCM remote is configured and HEALTHCARE_WORKSPACE is empty. Point the job at this repo or set HEALTHCARE_WORKSPACE to the project root.'
            }

            def workspacePath = pwd().replace('/', '\\')
            def sourcePath = source.replace('/', '\\')
            while (workspacePath.endsWith('\\')) {
              workspacePath = workspacePath.substring(0, workspacePath.length() - 1)
            }
            while (sourcePath.endsWith('\\')) {
              sourcePath = sourcePath.substring(0, sourcePath.length() - 1)
            }
            if (workspacePath.toLowerCase() == sourcePath.toLowerCase()) {
              error "Workspace is ${pwd()} but package.json was not found. Refusing to delete the project directory."
            }

            deleteDir()
            withEnv(["PROJECT_SOURCE=${source}"]) {
              if (isUnix()) {
                sh '''
                  set -eu
                  test -f "$PROJECT_SOURCE/package.json"
                  test -f "$PROJECT_SOURCE/playwright.config.js"
                  tar -C "$PROJECT_SOURCE" \
                    --exclude=node_modules \
                    --exclude=.git \
                    --exclude=dist \
                    --exclude=automation/reports \
                    --exclude=playwright/.auth \
                    --exclude='*.pem' \
                    --exclude='*.key' \
                    -cf - . | tar -xf -
                  test -f package.json
                  test -f playwright.config.js
                '''
              } else {
                bat '''
                  @echo off
                  if not exist "%PROJECT_SOURCE%\\package.json" exit /b 1
                  if not exist "%PROJECT_SOURCE%\\playwright.config.js" exit /b 1
                  robocopy "%PROJECT_SOURCE%" "%CD%" /E /NFL /NDL /NP /XD node_modules .git dist "%PROJECT_SOURCE%\\automation\\reports" "%PROJECT_SOURCE%\\playwright\\.auth" /XF *.pem *.key *.p12
                  if %ERRORLEVEL% GEQ 8 exit /b 1
                  if exist automation\\reports rmdir /s /q automation\\reports
                  if exist playwright\\.auth rmdir /s /q playwright\\.auth
                  exit /b 0
                '''
              }
            }

            if (!fileExists('package.json') || !fileExists('playwright.config.js')) {
              error 'Checkout did not produce package.json and playwright.config.js.'
            }
          }
        }
      }
    }

    stage('Node.js') {
      steps {
        script {
          if (!isUnix()) {
            def nodeHome = (env.NODE_HOME ?: 'C:\\Program Files\\nodejs').trim()
            def current = env.Path ?: env.PATH ?: ''
            env.Path = "${nodeHome};${current}"
            env.PATH = env.Path
          }
          if (isUnix()) {
            sh 'node -v && npm -v'
          } else {
            bat 'node -v && npm -v'
          }
        }
      }
    }

    stage('Install dependencies') {
      steps {
        script {
          if (isUnix()) {
            sh '''
              set -eu
              if [ -f package-lock.json ]; then npm ci; else npm install; fi
              if [ -f backend/package-lock.json ]; then npm ci --prefix backend; else npm install --prefix backend; fi
              if [ -f frontend/package-lock.json ]; then npm ci --prefix frontend; else npm install --prefix frontend; fi
            '''
          } else {
            bat '''
              @echo off
              if exist package-lock.json (call npm ci) else (call npm install)
              if errorlevel 1 exit /b 1
              if exist backend\\package-lock.json (call npm ci --prefix backend) else (call npm install --prefix backend)
              if errorlevel 1 exit /b 1
              if exist frontend\\package-lock.json (call npm ci --prefix frontend) else (call npm install --prefix frontend)
              if errorlevel 1 exit /b 1
            '''
          }
        }
      }
    }

    stage('Static checks') {
      steps {
        script {
          if (isUnix()) {
            sh '''
              set -eu
              cd backend
              export DATABASE_URL="${DATABASE_URL:-mysql://prisma:prisma@127.0.0.1:3306/healthcare_db}"
              npx prisma validate
              npx prisma generate
              npm run build
              cd ../frontend
              npm run build
            '''
          } else {
            bat '''
              @echo off
              cd backend
              if "%DATABASE_URL%"=="" set DATABASE_URL=mysql://prisma:prisma@127.0.0.1:3306/healthcare_db
              call npx prisma validate
              if errorlevel 1 exit /b 1
              call npx prisma generate
              if errorlevel 1 exit /b 1
              call npm run build
              if errorlevel 1 exit /b 1
              cd ..\\frontend
              call npm run build
              if errorlevel 1 exit /b 1
            '''
          }
        }
      }
    }

    stage('Backend tests') {
      when {
        expression { return params.RUN_BACKEND_TESTS == true }
      }
      steps {
        withCredentials([string(credentialsId: 'healthcare-test-database-url', variable: 'TEST_DATABASE_URL')]) {
          script {
            if (isUnix()) {
              sh 'npm --prefix backend test'
            } else {
              bat 'call npm --prefix backend test'
            }
          }
        }
      }
    }

    stage('Install Playwright browser') {
      steps {
        script {
          if (isUnix()) {
            sh 'npx playwright install --with-deps chromium'
          } else {
            bat 'call npx playwright install chromium'
          }
        }
      }
    }

    stage('Playwright tests') {
      steps {
        script {
          if (isUnix()) {
            sh 'npm run test:e2e'
          } else {
            bat 'call npm run test:e2e'
          }
        }
      }
    }

    stage('Deploy staging') {
      when {
        allOf {
          not { changeRequest() }
          expression { return params.DEPLOY_STAGING == true }
          expression { return params.DEPLOY_CONFIRMATION == 'deploy-staging' }
        }
      }
      steps {
        script {
          if (env.CHANGE_ID) {
            error 'Refusing to deploy from a pull request.'
          }
        }
        input message: 'Deploy the deployment/staging branch to Render? Render will run prisma migrate deploy. It will not reset the database.', ok: 'Deploy staging'
        withCredentials([string(credentialsId: 'render-deploy-hook-staging', variable: 'RENDER_DEPLOY_HOOK')]) {
          script {
            if (isUnix()) {
              sh 'curl --fail --silent --show-error --request POST "$RENDER_DEPLOY_HOOK" --output /dev/null'
            } else {
              bat 'curl --fail --silent --show-error --request POST "%RENDER_DEPLOY_HOOK%" --output NUL'
            }
          }
        }
      }
    }

    stage('Staging smoke') {
      when {
        allOf {
          not { changeRequest() }
          anyOf {
            expression { return params.RUN_STAGING_SMOKE == true }
            allOf {
              expression { return params.DEPLOY_STAGING == true }
              expression { return params.DEPLOY_CONFIRMATION == 'deploy-staging' }
            }
          }
        }
      }
      steps {
        withCredentials([
          string(credentialsId: 'staging-frontend-url', variable: 'STAGING_BASE_URL'),
          string(credentialsId: 'staging-api-url', variable: 'STAGING_API_URL'),
          string(credentialsId: 'healthcare-e2e-password', variable: 'E2E_PASSWORD'),
        ]) {
          script {
            if (isUnix()) {
              sh '''
                set -eu
                node scripts/wait-for-http.js "${STAGING_API_URL}/api/ready" 36 10000 "${GIT_COMMIT:-}"
                BASE_URL="$STAGING_BASE_URL" API_BASE_URL="$STAGING_API_URL" npm run test:smoke
              '''
            } else {
              bat '''
                @echo off
                node scripts/wait-for-http.js "%STAGING_API_URL%/api/ready" 36 10000 "%GIT_COMMIT%"
                if errorlevel 1 exit /b 1
                set BASE_URL=%STAGING_BASE_URL%
                set API_BASE_URL=%STAGING_API_URL%
                call npm run test:smoke
              '''
            }
          }
        }
      }
    }
  }

  post {
    always {
      junit allowEmptyResults: true, testResults: 'automation/reports/junit/results.xml,backend/test-results/**/*.xml'
      archiveArtifacts allowEmptyArchive: true, artifacts: 'automation/reports/html/**,automation/reports/junit/**', excludes: '**/.env,**/.env.*,**/*.pem,**/*.key,**/playwright/.auth/**'
    }
    failure {
      archiveArtifacts allowEmptyArchive: true, artifacts: 'automation/reports/test-results/**', excludes: '**/.env,**/.env.*,**/*.pem,**/*.key,**/playwright/.auth/**'
    }
  }
}
