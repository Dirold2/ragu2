import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function copyNodeModules() {
  console.log('Starting post-build process...');
  
  try {
    // Find all modules in src/modules directory
    const modulesDir = path.join(rootDir, 'src', 'modules');
    const buildModulesDir = path.join(rootDir, 'build', 'modules');
    
    // Ensure the build/modules directory exists
    await fs.mkdir(buildModulesDir, { recursive: true });
    
    // Copy root .env file if it exists
    await copyEnvFile(rootDir, path.join(rootDir, 'build'));
    
    // Get all module directories
    const modules = await fs.readdir(modulesDir, { withFileTypes: true });
    
    // Process each module
    for (const module of modules) {
      if (!module.isDirectory()) continue;
      
      const moduleName = module.name;
      const srcModulePath = path.join(modulesDir, moduleName);
      const buildModulePath = path.join(buildModulesDir, moduleName);
      
      console.log(`Processing module: ${moduleName}`);
      
      // Ensure the build module directory exists
      await fs.mkdir(buildModulePath, { recursive: true });
      
      // Check if module has node_modules
      const srcNodeModulesPath = path.join(srcModulePath, 'node_modules');
      const buildNodeModulesPath = path.join(buildModulePath, 'node_modules');
      
      try {
        const nodeModulesStat = await fs.stat(srcNodeModulesPath);
        if (nodeModulesStat.isDirectory()) {
          console.log(`Copying node_modules for ${moduleName}...`);
          
          // Create symlink instead of copying to save space and time
          try {
            await fs.symlink(srcNodeModulesPath, buildNodeModulesPath, 'junction');
            console.log(`Created symlink for ${moduleName}/node_modules`);
          } catch (err) {
            // If symlink fails (e.g., already exists), try to copy
            if (err.code === 'EEXIST') {
              console.log(`Symlink already exists for ${moduleName}/node_modules`);
            } else {
              console.error(`Failed to create symlink for ${moduleName}/node_modules:`, err);
            }
          }
        }
      } catch (err) {
        // node_modules doesn't exist, skip
        if (err.code !== 'ENOENT') {
          console.error(`Error checking node_modules for ${moduleName}:`, err);
        }
      }
      
      // Special case for database module .prisma directory
      if (moduleName === 'database') {
        const srcPrismaPath = path.join(srcModulePath, '.prisma');
        const buildPrismaPath = path.join(buildModulePath, '.prisma');
        
        try {
          const prismaStat = await fs.stat(srcPrismaPath);
          if (prismaStat.isDirectory()) {
            console.log('Copying .prisma directory for database module...');
            
            // Remove existing .prisma directory if it exists
            try {
              await fs.rm(buildPrismaPath, { recursive: true, force: true });
            } catch (err) {
              // Ignore if it doesn't exist
            }
            
            // Copy the .prisma directory
            await copyDir(srcPrismaPath, buildPrismaPath);
            console.log('Copied .prisma directory successfully');
          }
        } catch (err) {
          // .prisma doesn't exist, skip
          if (err.code !== 'ENOENT') {
            console.error('Error checking .prisma directory:', err);
          }
        }
      }
      
      // Copy package.json if it exists
      const srcPackageJsonPath = path.join(srcModulePath, 'package.json');
      const buildPackageJsonPath = path.join(buildModulePath, 'package.json');
      
      try {
        const packageJsonStat = await fs.stat(srcPackageJsonPath);
        if (packageJsonStat.isFile()) {
          console.log(`Copying package.json for ${moduleName}...`);
          await fs.copyFile(srcPackageJsonPath, buildPackageJsonPath);
        }
      } catch (err) {
        // package.json doesn't exist, skip
        if (err.code !== 'ENOENT') {
          console.error(`Error checking package.json for ${moduleName}:`, err);
        }
      }
      
      // Copy .env file if it exists
      await copyEnvFile(srcModulePath, buildModulePath);
    }
    
    console.log('Post-build process completed successfully!');
  } catch (err) {
    console.error('Error during post-build process:', err);
    process.exit(1);
  }
}

// Helper function to copy a directory recursively
async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// Helper function to copy .env files
async function copyEnvFile(srcDir, destDir) {
  // Check for .env file
  const srcEnvPath = path.join(srcDir, '.env');
  const destEnvPath = path.join(destDir, '.env');
  
  try {
    const envStat = await fs.stat(srcEnvPath);
    if (envStat.isFile()) {
      console.log(`Copying .env file from ${path.relative(rootDir, srcDir)}...`);
      await fs.copyFile(srcEnvPath, destEnvPath);
    }
  } catch (err) {
    // .env doesn't exist, skip
    if (err.code !== 'ENOENT') {
      console.error(`Error checking .env file in ${path.relative(rootDir, srcDir)}:`, err);
    }
  }
  
  // Also check for .env.* files (like .env.production, .env.development, etc.)
  try {
    const files = await fs.readdir(srcDir);
    const envFiles = files.filter(file => file.startsWith('.env.'));
    
    for (const envFile of envFiles) {
      const srcEnvFilePath = path.join(srcDir, envFile);
      const destEnvFilePath = path.join(destDir, envFile);
      
      const fileStat = await fs.stat(srcEnvFilePath);
      if (fileStat.isFile()) {
        console.log(`Copying ${envFile} file from ${path.relative(rootDir, srcDir)}...`);
        await fs.copyFile(srcEnvFilePath, destEnvFilePath);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Error checking .env.* files in ${path.relative(rootDir, srcDir)}:`, err);
    }
  }
}

// Run the script
copyNodeModules();