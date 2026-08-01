const fs = require('node:fs');
const path = require('node:path');

const { IOSConfig, withXcodeProject } = require('@expo/config-plugins');

const modelId = 'kokoro-int8-en-v0_19';

module.exports = function withBundledTtsModel(config) {
  return withXcodeProject(config, (projectConfig) => {
    const { platformProjectRoot, projectRoot } = projectConfig.modRequest;
    const source = path.join(projectRoot, 'assets', 'tts-native', 'models', modelId);
    if (!fs.existsSync(path.join(source, 'model.int8.onnx'))) {
      throw new Error('The bundled Kokoro model is missing. Run npm run prepare:tts-model before prebuilding iOS.');
    }

    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const modelsDirectory = path.join(platformProjectRoot, projectName, 'models');
    const destination = path.join(modelsDirectory, modelId);
    fs.mkdirSync(modelsDirectory, { recursive: true });
    fs.cpSync(source, destination, { recursive: true });

    const resourcePath = `${projectName}/models`;
    if (!projectConfig.modResults.hasFile(resourcePath)) {
      const target = projectConfig.modResults.getFirstTarget().uuid;
      projectConfig.modResults.addResourceFile(resourcePath, { lastKnownFileType: 'folder', target }, projectName);
    }
    return projectConfig;
  });
};
