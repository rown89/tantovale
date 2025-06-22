import { ClipboardList, LucideProps, Settings, StretchHorizontal, UserPen } from 'lucide-react';
import { ComponentType } from 'react';

interface ProfileOptionsProps {
	Icon: ComponentType<LucideProps>;
	label: string;
	url: string;
	slug: string;
}

export const profileOptions: ProfileOptionsProps[] = [
	{
		Icon: UserPen,
		label: 'Profile',
		url: '/auth/profile/info',
		slug: 'info',
	},
	{
		Icon: StretchHorizontal,
		label: 'Selling items',
		url: '/auth/profile/selling-items',
		slug: 'selling-items',
	},
	{
		Icon: ClipboardList,
		label: 'Orders',
		url: '/auth/profile/orders',
		slug: 'orders',
	},
	{
		Icon: Settings,
		label: 'Settings',
		url: '/auth/profile/settings',
		slug: 'settings',
	},
];
