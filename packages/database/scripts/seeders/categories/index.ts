import { seedDatabase } from './seeder';

seedDatabase()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error('Failed to seed database:', error);
		process.exit(1);
	});
