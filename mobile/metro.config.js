const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Encontra a raiz do projeto (onde está a pasta src)
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. Monitora todos os arquivos na raiz do workspace
config.watchFolders = [workspaceRoot];

// 2. Garante que o Metro consiga resolver os módulos de dentro de mobile primeiro
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
