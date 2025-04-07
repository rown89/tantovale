interface LinkBuilderProps {
	id: number;
	title: string;
}

export function linkBuilder({ id, title }: LinkBuilderProps) {
	const formattedTitle = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric characters with hyphens
		.replace(/^-|-$/g, ''); // Remove leading and trailing hyphens

	return `${formattedTitle}-${id}`;
}
