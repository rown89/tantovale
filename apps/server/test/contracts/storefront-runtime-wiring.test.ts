import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

async function storefrontSource(relativePath: string): Promise<ts.SourceFile> {
	const path = resolve(process.cwd(), '../storefront/src', relativePath);
	return ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function mutatedSource(source: ts.SourceFile, before: string, after: string): ts.SourceFile {
	const text = source.getFullText();
	if (!text.includes(before)) throw new Error(`Mutation target not found: ${before}`);
	return ts.createSourceFile(
		source.fileName,
		text.replaceAll(before, after),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
}

function descendants<T extends ts.Node>(root: ts.Node, guard: (node: ts.Node) => node is T): T[] {
	const matches: T[] = [];
	const visit = (node: ts.Node) => {
		if (guard(node)) matches.push(node);
		ts.forEachChild(node, visit);
	};
	visit(root);
	return matches;
}

function callsNamed(root: ts.Node, name: string): ts.CallExpression[] {
	return descendants(root, ts.isCallExpression).filter(
		(call) => ts.isIdentifier(call.expression) && call.expression.text === name,
	);
}

function objectProperty(object: ts.ObjectLiteralExpression, name: string): ts.ObjectLiteralElementLike | undefined {
	return object.properties.find((property) => property.name?.getText() === name);
}

describe('storefront real component lifecycle wiring', () => {
	it('ProfileMenu sends the actual Logout item through the AuthProvider logout callback', async () => {
		const source = await storefrontSource('app/auth/profile/components/menu/index.tsx');
		const authBinding = descendants(source, ts.isVariableDeclaration).find(
			(declaration) =>
				ts.isObjectBindingPattern(declaration.name) &&
				declaration.name.elements.some((element) => element.name.getText() === 'logout') &&
				declaration.initializer &&
				ts.isCallExpression(declaration.initializer) &&
				declaration.initializer.expression.getText() === 'useAuth',
		);
		const logoutAttribute = descendants(source, ts.isJsxAttribute).find(
			(attribute) =>
				attribute.name.getText() === 'onClickCapture' &&
				attribute.initializer &&
				ts.isJsxExpression(attribute.initializer) &&
				attribute.initializer.expression?.getText() === 'createProfileLogoutHandler(logout)',
		);

		expect(authBinding).toBeDefined();
		expect(logoutAttribute).toBeDefined();
		const disconnected = mutatedSource(
			source,
			'onClickCapture={createProfileLogoutHandler(logout)}',
			'onClickCapture={() => undefined}',
		);
		expect(
			descendants(disconnected, ts.isJsxAttribute).some(
				(attribute) =>
					attribute.name.getText() === 'onClickCapture' &&
					attribute.initializer?.getText().includes('createProfileLogoutHandler(logout)'),
			),
		).toBe(false);
	});

	it('AuthProvider delegates its real initialization to the generation-guarded logout lifecycle', async () => {
		const source = await storefrontSource('providers/auth-providers.tsx');
		const initializeCall = callsNamed(source, 'initializeAuthSession')[0];
		expect(initializeCall).toBeDefined();
		const options = initializeCall?.arguments[0];
		expect(options && ts.isObjectLiteralExpression(options)).toBe(true);
		if (!options || !ts.isObjectLiteralExpression(options))
			throw new Error('Missing AuthProvider initialization options');

		expect(objectProperty(options, 'logout')?.getText()).toBe('logout');
		expect(objectProperty(options, 'isCurrent')?.getText()).toBe('isCurrent');
		expect(objectProperty(options, 'commit')?.getText()).toBe('commit: commitIdentity');
		expect(callsNamed(source, 'logoutClientSession')).toHaveLength(1);
		const cleanupAdvancesGeneration = descendants(source, ts.isBinaryExpression).some(
			(expression) =>
				expression.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken &&
				expression.left.getText() === 'authGenerationRef.current',
		);
		expect(cleanupAdvancesGeneration).toBe(true);
		const disconnected = mutatedSource(source, '\t\t\t\t\tlogout,', '\t\t\t\t\tlogout: () => undefined,');
		const disconnectedCall = callsNamed(disconnected, 'initializeAuthSession')[0];
		const disconnectedOptions = disconnectedCall?.arguments[0];
		expect(
			disconnectedOptions &&
				ts.isObjectLiteralExpression(disconnectedOptions) &&
				objectProperty(disconnectedOptions, 'logout')?.getText() === 'logout',
		).toBe(false);
	});

	it('BuyNowDialog wires the current request into the cancellable payment scheduler and unmount cleanup', async () => {
		const source = await storefrontSource('components/dialogs/buy-now-dialog/index.tsx');
		const finishCall = callsNamed(source, 'finishBuyNowAction')[0];
		const scheduleCall = callsNamed(source, 'scheduleBuyNowPaymentAction')[0];
		expect(finishCall).toBeDefined();
		expect(scheduleCall).toBeDefined();
		const finishOptions = finishCall?.arguments[0];
		const scheduleOptions = scheduleCall?.arguments[0];
		if (!finishOptions || !ts.isObjectLiteralExpression(finishOptions))
			throw new Error('Missing Buy Now completion wiring');
		if (!scheduleOptions || !ts.isObjectLiteralExpression(scheduleOptions))
			throw new Error('Missing Buy Now scheduler wiring');

		expect(objectProperty(finishOptions, 'request')?.getText()).toBe('request: requestPromise');
		expect(objectProperty(finishOptions, 'isCurrent')?.getText()).toBe('isCurrent: requestIsCurrent');
		expect(objectProperty(scheduleOptions, 'isCurrent')?.getText()).toBe('isCurrent: requestIsCurrent');
		expect(objectProperty(scheduleOptions, 'subscribe')?.getText()).toContain('useTantovaleStore.subscribe(listener)');
		const cleanupCancel = descendants(source, ts.isCallExpression).some(
			(call) => call.expression.getText() === 'pendingPaymentAction.current?.cancel',
		);
		expect(cleanupCancel).toBe(true);
		const disconnected = mutatedSource(
			source,
			'pendingPaymentAction.current?.cancel();',
			'void pendingPaymentAction.current;',
		);
		expect(
			descendants(disconnected, ts.isCallExpression).some(
				(call) => call.expression.getText() === 'pendingPaymentAction.current?.cancel',
			),
		).toBe(false);
	});

	it('ChatInput passes its real RPC mutation and form reset through the checked mutation helper', async () => {
		const source = await storefrontSource('components/chat/chat-input/index.tsx');
		const mutationCall = callsNamed(source, 'useMutation')[0];
		expect(mutationCall).toBeDefined();
		const mutationOptions = mutationCall?.arguments[0];
		if (!mutationOptions || !ts.isObjectLiteralExpression(mutationOptions))
			throw new Error('Missing ChatInput mutation');
		const helperSpread = mutationOptions.properties.find(
			(property): property is ts.SpreadAssignment =>
				ts.isSpreadAssignment(property) &&
				ts.isCallExpression(property.expression) &&
				property.expression.expression.getText() === 'createChatMessageMutationOptions',
		);
		expect(helperSpread).toBeDefined();
		const helperCall = helperSpread?.expression;
		if (!helperCall || !ts.isCallExpression(helperCall)) throw new Error('Missing ChatInput helper call');
		const helperOptions = helperCall.arguments[0];
		if (!helperOptions || !ts.isObjectLiteralExpression(helperOptions))
			throw new Error('Missing ChatInput helper options');

		expect(objectProperty(helperOptions, 'profileId')?.getText()).toBe('profileId: user?.profile_id');
		expect(objectProperty(helperOptions, 'roomId')?.getText()).toBe('roomId: chatRoomId');
		expect(objectProperty(helperOptions, 'post')?.getText()).toContain(
			"client.chat.auth.rooms[':roomId'].messages.$post",
		);
		expect(objectProperty(helperOptions, 'reset')?.getText()).toContain('form.reset()');
		const disconnected = mutatedSource(source, '...createChatMessageMutationOptions({', '...({');
		expect(
			descendants(disconnected, ts.isSpreadAssignment).some(
				(property) =>
					ts.isCallExpression(property.expression) &&
					property.expression.expression.getText() === 'createChatMessageMutationOptions',
			),
		).toBe(false);
	});

	it('item and navbar entrypoints wire address checks through owner-aware preflight controllers', async () => {
		const itemSource = await storefrontSource('app/item/[slug]/item-detail-wrapper/index.tsx');
		const navbarSource = await storefrontSource('components/navbar/navbar.tsx');
		const itemRuns = descendants(itemSource, ts.isCallExpression).filter(
			(call) => call.expression.getText() === 'addressPreflight.run',
		);
		const navbarRuns = descendants(navbarSource, ts.isCallExpression).filter(
			(call) => call.expression.getText() === 'addressPreflight.run',
		);

		expect(itemRuns).toHaveLength(2);
		for (const call of itemRuns) {
			const options = call.arguments[0];
			if (!options || !ts.isObjectLiteralExpression(options)) throw new Error('Missing item address preflight options');
			expect(objectProperty(options, 'request')?.getText()).toBe('request: AddressProtectedRoute');
			expect(objectProperty(options, 'isOwnerCurrent')?.getText()).toContain('commerceOwnerMatches');
			expect(objectProperty(options, 'setLoading')?.getText()).toBe('setLoading: setIsAddressLoading');
		}
		expect(navbarRuns).toHaveLength(1);
		const navbarOptions = navbarRuns[0]?.arguments[0];
		if (!navbarOptions || !ts.isObjectLiteralExpression(navbarOptions)) {
			throw new Error('Missing navbar address preflight options');
		}
		expect(objectProperty(navbarOptions, 'isOwnerCurrent')?.getText()).toContain('profileIdRef.current === profileId');
		expect(objectProperty(navbarOptions, 'isOwnerCurrent')?.getText()).toContain('commerceOwnerMatches');
		expect(objectProperty(navbarOptions, 'onAddress')?.getText()).toContain("router.push('/auth/item/new')");
	});

	it('the proposal cancellation caller routes the discriminated result through truthful feedback', async () => {
		const source = await storefrontSource('app/item/[slug]/item-detail-wrapper/components/user-info-box.tsx');
		const feedbackCall = callsNamed(source, 'applyProposalAbortFeedback')[0];
		expect(feedbackCall).toBeDefined();
		expect(feedbackCall?.arguments[0]?.getText()).toBe('result');
		const actions = feedbackCall?.arguments[1];
		if (!actions || !ts.isObjectLiteralExpression(actions)) throw new Error('Missing proposal feedback actions');
		expect(objectProperty(actions, 'onCancelled')?.getText()).toContain('toast.success');
		expect(objectProperty(actions, 'onFailed')?.getText()).toContain('toast.error');
		expect(actions.properties).toHaveLength(2);
	});
});
