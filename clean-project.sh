#!/bin/bash

echo "Cleaning node_modules folders..."

# Remove node_modules from root directory
if [ -d "node_modules" ]; then
  echo "Removing node_modules from root directory"
  rm -rf node_modules
fi

# Remove pnpm-specific files from root directory
if [ -f "package-lock.json" ]; then
  echo "Removing package-lock.json from root directory"
  rm -f package-lock.json
fi

if [ -d ".pnpm-store" ]; then
  echo "Removing .pnpm-store from root directory"
  rm -rf .pnpm-store
fi

if [ -f "pnpm-lock.yaml" ]; then
  echo "Removing pnpm-lock.yaml from root directory"
  rm -f pnpm-lock.yaml
fi

# Remove turbo folder from root directory
if [ -d ".turbo" ]; then
  echo "Removing .turbo folder from root directory"
  rm -rf .turbo
fi

# Remove node_modules from apps subdirectories
if [ -d "apps" ]; then
  echo "Removing node_modules from apps subdirectories"
  find apps -name "node_modules" -type d -exec rm -rf {} +
  
  # Remove pnpm-specific files from apps subdirectories
  echo "Removing pnpm-lock.yaml from apps subdirectories"
  find apps -name "pnpm-lock.yaml" -type f -exec rm -f {} \;
  
  # Remove .next folder from apps/storefront
  if [ -d "apps/storefront/.next" ]; then
    echo "Removing .next folder from apps/storefront"
    rm -rf apps/storefront/.next
  fi
  
  # Remove build folders from apps subdirectories
  echo "Removing build folders from apps subdirectories"
  find apps -name "build" -type d -exec rm -rf {} +
fi

# Remove node_modules from packages subdirectories
if [ -d "packages" ]; then
  echo "Removing node_modules from packages subdirectories"
  find packages -name "node_modules" -type d -exec rm -rf {} +
  
  # Remove pnpm-specific files from packages subdirectories
  echo "Removing pnpm-lock.yaml from packages subdirectories"
  find packages -name "pnpm-lock.yaml" -type f -exec rm -f {} \;
fi

echo "Cleaning complete!" 