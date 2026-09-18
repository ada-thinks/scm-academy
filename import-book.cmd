@echo off
cd /d d:\lls\project\scm-academy
"D:\lls\huangchunfei\AppData\Roaming\nvm\v22.23.2\node.exe" --env-file=.env node_modules\tsx\dist\cli.mjs scripts\import-book-courses.ts %* > import.log 2>&1
