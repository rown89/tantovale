import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';

import PurchasedOrdersComponent from './purchased';
import SoldOrdersComponent from './sold';

export default function UserSellingItemsComponent() {
	return (
		<div className='flex w-full flex-col gap-7 overflow-auto px-4'>
			<div className='bg-background z-1 sticky top-0 flex items-center justify-between'>
				<div className='w-full space-y-6'>
					<h1 className='text-3xl font-bold'>Orders</h1>
				</div>
			</div>

			<Tabs defaultValue='purchased'>
				<TabsList className='w-full'>
					<TabsTrigger value='sold'>Sold</TabsTrigger>
					<TabsTrigger value='purchased'>Purchased</TabsTrigger>
				</TabsList>
				<TabsContent value='purchased' className='mt-2'>
					<PurchasedOrdersComponent />
				</TabsContent>
				<TabsContent value='sold' className='mt-2'>
					<SoldOrdersComponent />
				</TabsContent>
			</Tabs>
		</div>
	);
}
