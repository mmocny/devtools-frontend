// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as fs from 'fs';
import * as path from 'path';

import {generateClosureBridge, GeneratedCode} from './generate_closure.js';
import {filePathToTypeScriptSourceFile, walkTree} from './walk_tree.js';

const chromeLicense = `// Copyright ${new Date().getFullYear()} The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
`;

const getFullBridgeFilePath = (inputFilePath: string) => {
  const dir = path.dirname(inputFilePath);
  const baseName = path.basename(inputFilePath, '.ts');
  return path.join(dir, `${baseName}_bridge.js`);
};

export const writeToDisk = (inputFilePath: string, generatedCode: GeneratedCode) => {
  const baseName = path.basename(inputFilePath, '.ts');
  const outputFileName = getFullBridgeFilePath(inputFilePath);

  const importStatement = `import './${baseName}.js';`;

  const types = generatedCode.types
                    .map(typePart => {
                      return typePart.join('\n');
                    })
                    .join('\n');
  const classDeclaration = generatedCode.closureClass.join('\n');
  const creatorFunction = generatedCode.creatorFunction.join('\n');

  const relativeFilePath = path.relative(process.cwd(), inputFilePath);

  const byHandWarning = `/**
* WARNING: do not modify this file by hand!
* it was automatically generated by the bridge generator
* if you made changes to the source code and need to update this file, run:
*  npm run generate-bridge-file ${relativeFilePath}
*/
`;

  // extra \n to ensure ending with a linebreak at end of file
  const finalCode =
      [chromeLicense, byHandWarning, importStatement, types, classDeclaration, creatorFunction].join('\n') + '\n';

  fs.writeFileSync(outputFileName, finalCode, {encoding: 'utf8'});

  return {
    output: outputFileName,
    code: finalCode,
  };
};

interface Options {
  forceRewriting: boolean;
}

const checkForManuallyEditedBridgeFile = (componentSourceFilePath: string): boolean => {
  const bridgeFilePath = getFullBridgeFilePath(componentSourceFilePath);
  if (!fs.existsSync(bridgeFilePath)) {
    return false;
  }

  const contentsOfBridge = fs.readFileSync(bridgeFilePath, {encoding: 'utf-8'});
  return contentsOfBridge.includes('MANUALLY_EDITED_BRIDGE=');
};

export const parseTypeScriptComponent = (componentSourceFilePath: string, options: Options = {
  forceRewriting: false,
}) => {
  console.log(`\n${path.basename(componentSourceFilePath)}`);
  const hasManuallyEditedBridge = checkForManuallyEditedBridgeFile(componentSourceFilePath);
  if (hasManuallyEditedBridge && !options.forceRewriting) {
    console.log('Skipping bridge generation; existing bridge file contains a `MANUALLY_EDITED_BRIDGE=` comment.');
    console.log('To regenerate, pass the `--force` flag or remove that comment from the existing bridge and re-run.');
    return {output: undefined, code: undefined};
  }

  const file = filePathToTypeScriptSourceFile(componentSourceFilePath);
  const state = walkTree(file, componentSourceFilePath);
  const generatedCode = generateClosureBridge(state);
  return writeToDisk(componentSourceFilePath, generatedCode);
};

export const main = (args: string[]) => {
  const bridgeComponentPath = path.resolve(process.cwd(), args[0]);
  const forceRewriting = args[1] === '--force';

  if (!bridgeComponentPath || !fs.existsSync(bridgeComponentPath)) {
    throw new Error(`Could not find bridgeComponent path ${bridgeComponentPath}`);
  }

  const {output} = parseTypeScriptComponent(bridgeComponentPath, {forceRewriting});

  if (output) {
    console.log('Wrote bridge file to', path.relative(process.cwd(), output));
  }

  return output;
};

if (require.main === module) {
  main(process.argv.slice(2));
}
