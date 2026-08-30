#!/bin/bash

echo "Starting database seeding process..."



# Run seed categories
echo "Seeding categories..."
pnpm run seed-categories
if [ $? -ne 0 ]; then
  echo "Error seeding categories. Exiting."
  exit 1
fi

# Run seed countries
echo "Seeding countries..."
pnpm run seed-countries
if [ $? -ne 0 ]; then
  echo "Error seeding countries. Exiting."
  exit 1
fi

# Run seed users
echo "Seeding users..."
pnpm run seed-users
if [ $? -ne 0 ]; then
  echo "Error seeding users. Exiting."
  exit 1
fi

echo "Database seeding completed successfully!"
