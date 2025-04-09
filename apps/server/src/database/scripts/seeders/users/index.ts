import { seedDatabase } from './seeder';

seedDatabase()
	.catch((error: unknown) => {
		console.error('❌ Fatal error during seeding:', error);
		process.exit(1);
	})
	.finally(() => {
		console.log('Closing database connection...');
		process.exit(0);
	});
