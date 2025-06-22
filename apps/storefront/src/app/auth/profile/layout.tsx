import ProfileMenu from './components/menu';

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<div className='container relative top-4 mx-auto flex h-[calc(100vh-76px)] w-full gap-8'>
			<ProfileMenu />
			{children}
		</div>
	);
}
