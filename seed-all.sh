#!/bin/bash

echo "Starting database seeding process..."



# Run seed categories
echo "Seeding categories..."
pnpm run seed-categories
if [ $? -ne 0 ]; then
  echo "Error seeding categories. Exiting."
  exit 1
fi

# Handle countries seeding with zip extraction
echo "Preparing countries data..."
COUNTRIES_DIR="apps/server/src/database/scripts/seeders/countries/data"

# Create data directory if it doesn't exist
mkdir -p "$COUNTRIES_DIR"

# Extract the zip file
unzip -o "$COUNTRIES_DIR/countries.zip" -d "$COUNTRIES_DIR"
if [ $? -ne 0 ]; then
  echo "Error extracting countries.zip. Exiting."
  exit 1
fi

# Run seed countries
echo "Seeding countries..."
pnpm run seed-countries
if [ $? -ne 0 ]; then
  echo "Error seeding countries. Exiting."
  exit 1
fi

# Clean up - remove all files except countries.zip
echo "Cleaning up countries data directory..."
find "$COUNTRIES_DIR" -type f -not -name "countries.zip" -delete

# Run seed users
echo "Seeding users..."
pnpm run seed-users
if [ $? -ne 0 ]; then
  echo "Error seeding users. Exiting."
  exit 1
fi

echo "Database seeding completed successfully!" 