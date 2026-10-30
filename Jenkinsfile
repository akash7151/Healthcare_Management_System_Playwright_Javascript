// Healthcare Management — headless Playwright on Jenkins.
//
// Node.js LTS is the machine-wide install at C:\Program Files\nodejs. The NodeJS
// Jenkins plugin is not installed, and this Jenkins service process does not
// have that directory on PATH. On Windows the Node.js stage prepends it
// (override with NODE_HOME). Linux agents use node/npm already on PATH.
//
// Checkout uses Pipeline from SCM when this job has a remote. This project has
// no git remote, so the Jenkins job stores this file as its Pipeline script and
// the Checkout stage copies HEALTHCARE_WORKSPACE (default D:\Healthcare Management)
// into the job workspace. node_modules, .git, and dist are not copied.
// backend/.env in that tree supplies DATABASE_URL for the Playwright webServer.
// Do not commit that file.
//
// The suite is headless chromium: `npm run test:e2e` with CI=true.
// `npx playwright install --with-deps` is Linux-only; Windows installs Chromium
// without system dependencies.

pipeline {
  agent any

  parameters {
    string(
      name: 'HEALTHCARE_WORKSPACE',
      defaultValue: 'D:\\Healthcare Management',
      description: 'Project directory to copy when this job has no SCM remote. Ignored when package.json is already in the workspace.'
    )
  }

  environment {
    CI = 'true'
  }

  options {
    timeout(time: 60, unit: 'MINUTES')
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '10'))
    disableConcurrentBuilds()
  }

  stages {
    stage('Checkout') {
      steps {
        script {
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
                  tar -C "$PROJECT_SOURCE" --exclude=node_modules --exclude=.git --exclude=dist --exclude=automation/reports -cf - . | tar -xf -
                  test -f package.json
                  test -f playwright.config.js
                '''
              } else {
                bat '''
                  @echo off
                  if not exist "%PROJECT_SOURCE%\\package.json" exit /b 1
                  if not exist "%PROJECT_SOURCE%\\playwright.config.js" exit /b 1
                  robocopy "%PROJECT_SOURCE%" "%CD%" /E /NFL /NDL /NP /XD node_modules .git dist "%PROJECT_SOURCE%\\automation\\reports"
                  if %ERRORLEVEL% GEQ 8 exit /b 1
                  if exist automation\\reports rmdir /s /q automation\\reports
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

    stage('E2E tests') {
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
  }

  post {
    always {
      junit allowEmptyResults: true, testResults: 'automation/reports/junit/results.xml'
      archiveArtifacts allowEmptyArchive: true, artifacts: 'automation/reports/html/**'
    }
    failure {
      archiveArtifacts allowEmptyArchive: true, artifacts: 'automation/reports/test-results/**'
    }
  }
}
