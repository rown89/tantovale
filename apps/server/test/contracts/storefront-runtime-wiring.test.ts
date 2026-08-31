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

function swappedSource(source: ts.SourceFile, first: string, second: string): ts.SourceFile {
	const text = source.getFullText();
	if (!text.includes(first) || !text.includes(second)) throw new Error('Swap target not found');
	const placeholder = '__M07_AST_SWAP_PLACEHOLDER__';
	return ts.createSourceFile(
		source.fileName,
		text.replace(first, placeholder).replace(second, first).replace(placeholder, second),
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

function jsxElementsNamed(root: ts.Node, name: string): ts.JsxElement[] {
	return descendants(root, ts.isJsxElement).filter((element) => element.openingElement.tagName.getText() === name);
}

function jsxAttribute(element: ts.JsxElement, name: string): ts.JsxAttribute | undefined {
	return element.openingElement.attributes.properties.find(
		(attribute): attribute is ts.JsxAttribute => ts.isJsxAttribute(attribute) && attribute.name.getText() === name,
	);
}

function profileLogoutIsWired(source: ts.SourceFile): boolean {
	return jsxElementsNamed(source, 'CommandItem').some((element) => {
		const isLogoutItem = jsxElementsNamed(element, 'span').some((span) =>
			span.children.some((child) => ts.isJsxText(child) && child.text.trim() === 'Logout'),
		);
		const handler = jsxAttribute(element, 'onClickCapture');
		return (
			isLogoutItem &&
			handler?.initializer !== undefined &&
			ts.isJsxExpression(handler.initializer) &&
			handler.initializer.expression?.getText() === 'createProfileLogoutHandler(logout)'
		);
	});
}

function authInitializationCleanupAdvancesGeneration(source: ts.SourceFile): boolean {
	const initializationEffect = callsNamed(source, 'useEffect').find((call) =>
		descendants(call.arguments[0] ?? call, ts.isCallExpression).some(
			(nestedCall) => nestedCall.expression.getText() === 'initializeAuth',
		),
	);
	if (!initializationEffect) return false;
	return descendants(initializationEffect.arguments[0] ?? initializationEffect, ts.isReturnStatement).some(
		(statement) => {
			const cleanup = statement.expression;
			return (
				cleanup !== undefined &&
				ts.isArrowFunction(cleanup) &&
				descendants(cleanup.body, ts.isBinaryExpression).some(
					(expression) =>
						expression.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken &&
						expression.left.getText() === 'authGenerationRef.current',
				)
			);
		},
	);
}

function buyNowSchedulerIsAssigned(source: ts.SourceFile): boolean {
	return descendants(source, ts.isBinaryExpression).some(
		(expression) =>
			expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			expression.left.getText() === 'pendingPaymentAction.current' &&
			ts.isCallExpression(expression.right) &&
			expression.right.expression.getText() === 'scheduleBuyNowPaymentAction',
	);
}

function buyNowUnmountCleanupCancels(source: ts.SourceFile): boolean {
	return callsNamed(source, 'useEffect').some((call) => {
		const dependencies = call.arguments[1];
		if (!dependencies || !ts.isArrayLiteralExpression(dependencies) || dependencies.elements.length !== 0) return false;
		const effect = call.arguments[0];
		if (!effect || !ts.isArrowFunction(effect) || !ts.isArrowFunction(effect.body)) return false;
		return descendants(effect.body.body, ts.isCallExpression).some(
			(cleanupCall) => cleanupCall.expression.getText() === 'pendingPaymentAction.current?.cancel',
		);
	});
}

function buyNowRequestGuardIsExact(source: ts.SourceFile): boolean {
	const declaration = descendants(source, ts.isVariableDeclaration).find(
		(candidate) => candidate.name.getText() === 'requestIsCurrent',
	);
	if (!declaration?.initializer || !ts.isArrowFunction(declaration.initializer)) return false;
	const body = declaration.initializer.body;
	return (
		ts.isCallExpression(body) &&
		body.expression.getText() === 'buyNowRequestMatches' &&
		body.arguments[0]?.getText() === 'useTantovaleStore.getState()' &&
		body.arguments[1]?.getText() === 'requestSnapshot'
	);
}

function chatFormSubmitsThroughMutation(source: ts.SourceFile): boolean {
	const formDeclaration = descendants(source, ts.isVariableDeclaration).find(
		(candidate) => candidate.name.getText() === 'form',
	);
	if (!formDeclaration?.initializer || !ts.isCallExpression(formDeclaration.initializer)) return false;
	const options = formDeclaration.initializer.arguments[0];
	if (!options || !ts.isObjectLiteralExpression(options)) return false;
	const onSubmit = objectProperty(options, 'onSubmit');
	return callbackCalls(onSubmit).some(
		(call) => call.expression.getText() === 'sendMessage.mutate' && call.arguments[0]?.getText() === 'value.message',
	);
}

function itemAddressRun(source: ts.SourceFile, handlerName: 'handleProposal' | 'handlePayment') {
	const handler = descendants(source, ts.isVariableDeclaration).find(
		(candidate) => candidate.name.getText() === handlerName,
	);
	return handler
		? descendants(handler, ts.isCallExpression).find((call) => call.expression.getText() === 'addressPreflight.run')
		: undefined;
}

function itemHandlerOpensExpectedModal(
	source: ts.SourceFile,
	handlerName: 'handleProposal' | 'handlePayment',
): boolean {
	const run = itemAddressRun(source, handlerName);
	const options = run?.arguments[0];
	if (!options || !ts.isObjectLiteralExpression(options)) return false;
	const calls = callbackCalls(objectProperty(options, 'onAddress'));
	const expectedModal = handlerName === 'handleProposal' ? 'setIsProposalModalOpen' : 'setIsBuyNowModalOpen';
	return (
		calls.length === 2 &&
		calls[0]?.expression.getText() === 'setAddressId' &&
		calls[1]?.expression.getText() === expectedModal &&
		calls[1]?.arguments[0]?.kind === ts.SyntaxKind.TrueKeyword
	);
}

function proposalAbortFeedbackUsesAwaitedResult(source: ts.SourceFile): boolean {
	const feedbackCall = callsNamed(source, 'applyProposalAbortFeedback')[0];
	if (feedbackCall?.arguments[0]?.getText() !== 'result') return false;
	const declaration = descendants(source, ts.isVariableDeclaration).find(
		(candidate) => candidate.name.getText() === 'result',
	);
	if (!declaration?.initializer || !ts.isAwaitExpression(declaration.initializer)) return false;
	const awaited = declaration.initializer.expression;
	const nearestArrow = (node: ts.Node): ts.ArrowFunction | undefined => {
		let current: ts.Node | undefined = node.parent;
		while (current) {
			if (ts.isArrowFunction(current)) return current;
			current = current.parent;
		}
		return undefined;
	};
	return (
		ts.isCallExpression(awaited) &&
		awaited.expression.getText() === 'handleBuyerAbortedProposal' &&
		awaited.arguments[0]?.getText() === 'orderProposal.id' &&
		nearestArrow(declaration) === nearestArrow(feedbackCall)
	);
}

function proposalWrapperUsesFilteredServerThenOwnedClient(source: ts.SourceFile): boolean {
	const orderProposal = descendants(source, ts.isVariableDeclaration).find(
		(candidate) => candidate.name.getText() === 'orderProposal',
	);
	const proposalId = descendants(source, ts.isVariableDeclaration).find(
		(candidate) => candidate.name.getText() === 'proposalId',
	);
	return (
		orderProposal?.initializer?.getText() === 'visibleServerProposal(item.orderProposal, dismissedServerProposalId)' &&
		proposalId?.initializer?.getText() ===
			'orderProposal?.id || (ownsCurrentCommerceState ? clientProposalId : undefined) || 0'
	);
}

function addressGuardIsExact(property: ts.ObjectLiteralElementLike | undefined, navbar: boolean): boolean {
	if (!property || !ts.isPropertyAssignment(property) || !ts.isArrowFunction(property.initializer)) return false;
	const body = property.initializer.body;
	if (!navbar) {
		return (
			ts.isCallExpression(body) &&
			body.expression.getText() === 'commerceOwnerMatches' &&
			body.arguments[1]?.getText() === 'owner'
		);
	}
	return (
		ts.isBinaryExpression(body) &&
		body.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
		body.left.getText() === 'profileIdRef.current === profileId' &&
		ts.isCallExpression(body.right) &&
		body.right.expression.getText() === 'commerceOwnerMatches' &&
		body.right.arguments[1]?.getText() === 'owner'
	);
}

function callbackCalls(property: ts.ObjectLiteralElementLike | undefined): ts.CallExpression[] {
	if (!property || !ts.isPropertyAssignment(property) || !ts.isArrowFunction(property.initializer)) return [];
	return descendants(property.initializer.body, ts.isCallExpression);
}

function hasNavigation(property: ts.ObjectLiteralElementLike | undefined, route: string): boolean {
	return callbackCalls(property).some(
		(call) => call.expression.getText() === 'router.push' && call.arguments[0]?.getText() === `'${route}'`,
	);
}

function itemAddressCallbacksAreDirected(options: ts.ObjectLiteralExpression): boolean {
	const addressCalls = callbackCalls(objectProperty(options, 'onAddress')).map((call) => call.expression.getText());
	return (
		addressCalls[0] === 'setAddressId' &&
		['setIsProposalModalOpen', 'setIsBuyNowModalOpen'].includes(addressCalls[1] ?? '') &&
		hasNavigation(objectProperty(options, 'onMissing'), '/auth/profile-setup/address') &&
		!hasNavigation(objectProperty(options, 'onError'), '/auth/profile-setup/address')
	);
}

function navbarAddressCallbacksAreDirected(options: ts.ObjectLiteralExpression): boolean {
	const addressCalls = callbackCalls(objectProperty(options, 'onAddress')).map((call) => call.expression.getText());
	return (
		addressCalls[0] === 'setAddressId' &&
		hasNavigation(objectProperty(options, 'onAddress'), '/auth/item/new') &&
		hasNavigation(objectProperty(options, 'onMissing'), '/auth/profile-setup/address') &&
		!hasNavigation(objectProperty(options, 'onError'), '/auth/profile-setup/address')
	);
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
		expect(authBinding).toBeDefined();
		expect(profileLogoutIsWired(source)).toBe(true);
		const disconnected = mutatedSource(
			source,
			'onClickCapture={createProfileLogoutHandler(logout)}',
			'onClickCapture={() => undefined}',
		);
		expect(profileLogoutIsWired(disconnected)).toBe(false);
		const moved = swappedSource(
			source,
			'onClickCapture={() => router.push(item.url)}',
			'onClickCapture={createProfileLogoutHandler(logout)}',
		);
		expect(profileLogoutIsWired(moved)).toBe(false);
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
		expect(authInitializationCleanupAdvancesGeneration(source)).toBe(true);
		const withoutCleanup = mutatedSource(
			source,
			'if (authGenerationRef.current === generation) authGenerationRef.current += 1;',
			'if (authGenerationRef.current === generation) void authGenerationRef.current;',
		);
		expect(authInitializationCleanupAdvancesGeneration(withoutCleanup)).toBe(false);
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
		expect(buyNowSchedulerIsAssigned(source)).toBe(true);
		expect(buyNowUnmountCleanupCancels(source)).toBe(true);
		expect(buyNowRequestGuardIsExact(source)).toBe(true);
		const disabledGuard = mutatedSource(
			source,
			'() => buyNowRequestMatches(useTantovaleStore.getState(), requestSnapshot)',
			'() => false',
		);
		expect(buyNowRequestGuardIsExact(disabledGuard)).toBe(false);
		const withoutAssignment = mutatedSource(
			source,
			'pendingPaymentAction.current = scheduleBuyNowPaymentAction({',
			'scheduleBuyNowPaymentAction({',
		);
		expect(buyNowSchedulerIsAssigned(withoutAssignment)).toBe(false);
		const withoutUnmountCancel = mutatedSource(
			source,
			`() => () => {
			pendingPaymentAction.current?.cancel();`,
			`() => () => {
			void pendingPaymentAction.current;`,
		);
		expect(buyNowUnmountCleanupCancels(withoutUnmountCancel)).toBe(false);
		expect(buyNowSchedulerIsAssigned(withoutUnmountCancel)).toBe(true);
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
		expect(chatFormSubmitsThroughMutation(source)).toBe(true);
		const inertFormMutation = mutatedSource(source, 'sendMessage.mutate(value.message);', 'void value.message;');
		expect(chatFormSubmitsThroughMutation(inertFormMutation)).toBe(false);
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
		expect(itemHandlerOpensExpectedModal(itemSource, 'handleProposal')).toBe(true);
		expect(itemHandlerOpensExpectedModal(itemSource, 'handlePayment')).toBe(true);
		const swappedModals = swappedSource(itemSource, 'setIsProposalModalOpen(true)', 'setIsBuyNowModalOpen(true)');
		expect(itemHandlerOpensExpectedModal(swappedModals, 'handleProposal')).toBe(false);
		expect(itemHandlerOpensExpectedModal(swappedModals, 'handlePayment')).toBe(false);
		for (const call of itemRuns) {
			const options = call.arguments[0];
			if (!options || !ts.isObjectLiteralExpression(options)) throw new Error('Missing item address preflight options');
			expect(objectProperty(options, 'request')?.getText()).toBe('request: AddressProtectedRoute');
			expect(addressGuardIsExact(objectProperty(options, 'isOwnerCurrent'), false)).toBe(true);
			expect(objectProperty(options, 'setLoading')?.getText()).toBe('setLoading: setIsAddressLoading');
			expect(itemAddressCallbacksAreDirected(options)).toBe(true);
		}
		expect(navbarRuns).toHaveLength(1);
		const navbarOptions = navbarRuns[0]?.arguments[0];
		if (!navbarOptions || !ts.isObjectLiteralExpression(navbarOptions)) {
			throw new Error('Missing navbar address preflight options');
		}
		expect(addressGuardIsExact(objectProperty(navbarOptions, 'isOwnerCurrent'), true)).toBe(true);
		expect(navbarAddressCallbacksAreDirected(navbarOptions)).toBe(true);
		const invertedItemGuard = mutatedSource(
			itemSource,
			'isOwnerCurrent: () => commerceOwnerMatches(useTantovaleStore.getState(), owner)',
			'isOwnerCurrent: () => !commerceOwnerMatches(useTantovaleStore.getState(), owner)',
		);
		for (const call of descendants(invertedItemGuard, ts.isCallExpression).filter(
			(candidate) => candidate.expression.getText() === 'addressPreflight.run',
		)) {
			const options = call.arguments[0];
			if (!options || !ts.isObjectLiteralExpression(options)) throw new Error('Missing mutated item preflight');
			expect(addressGuardIsExact(objectProperty(options, 'isOwnerCurrent'), false)).toBe(false);
		}
		const invertedNavbarGuard = mutatedSource(
			navbarSource,
			'profileIdRef.current === profileId && commerceOwnerMatches(useTantovaleStore.getState(), owner)',
			'profileIdRef.current !== profileId && commerceOwnerMatches(useTantovaleStore.getState(), owner)',
		);
		const mutatedNavbarRun = descendants(invertedNavbarGuard, ts.isCallExpression).find(
			(candidate) => candidate.expression.getText() === 'addressPreflight.run',
		);
		const mutatedNavbarOptions = mutatedNavbarRun?.arguments[0];
		if (!mutatedNavbarOptions || !ts.isObjectLiteralExpression(mutatedNavbarOptions)) {
			throw new Error('Missing mutated navbar preflight');
		}
		expect(addressGuardIsExact(objectProperty(mutatedNavbarOptions, 'isOwnerCurrent'), true)).toBe(false);
		const misdirectedItem = mutatedSource(
			itemSource,
			"router.push('/auth/profile-setup/address')",
			"router.push('/login')",
		);
		for (const call of descendants(misdirectedItem, ts.isCallExpression).filter(
			(candidate) => candidate.expression.getText() === 'addressPreflight.run',
		)) {
			const options = call.arguments[0];
			if (!options || !ts.isObjectLiteralExpression(options)) throw new Error('Missing misdirected item preflight');
			expect(itemAddressCallbacksAreDirected(options)).toBe(false);
		}
	});

	it('the proposal cancellation caller routes the discriminated result through truthful feedback', async () => {
		const source = await storefrontSource('app/item/[slug]/item-detail-wrapper/components/user-info-box.tsx');
		const confirmButton = jsxElementsNamed(source, 'Button').find((button) =>
			button.children.some((child) => ts.isJsxText(child) && child.text.trim() === 'Confirm'),
		);
		expect(confirmButton).toBeDefined();
		if (!confirmButton) throw new Error('Missing proposal confirmation button');
		expect(jsxAttribute(confirmButton, 'disabled')?.initializer?.getText()).toBe('{isCreatingProposal}');
		const clickHandler = jsxAttribute(confirmButton, 'onClick');
		if (!clickHandler?.initializer || !ts.isJsxExpression(clickHandler.initializer)) {
			throw new Error('Missing proposal confirmation handler');
		}
		const handler = clickHandler.initializer.expression;
		if (!handler) throw new Error('Missing proposal confirmation handler expression');
		const feedbackCall = callsNamed(handler, 'applyProposalAbortFeedback')[0];
		expect(feedbackCall).toBeDefined();
		expect(feedbackCall?.arguments[0]?.getText()).toBe('result');
		expect(proposalAbortFeedbackUsesAwaitedResult(source)).toBe(true);
		const constantResult = mutatedSource(
			source,
			'const result = await handleBuyerAbortedProposal(orderProposal.id);',
			"const result = 'cancelled' as const; void handleBuyerAbortedProposal(orderProposal.id);",
		);
		expect(proposalAbortFeedbackUsesAwaitedResult(constantResult)).toBe(false);
		const actions = feedbackCall?.arguments[1];
		if (!actions || !ts.isObjectLiteralExpression(actions)) throw new Error('Missing proposal feedback actions');
		expect(objectProperty(actions, 'onCancelled')?.getText()).toContain('toast.success');
		expect(objectProperty(actions, 'onFailed')?.getText()).toContain('toast.error');
		expect(actions.properties).toHaveLength(2);
		const wrapper = await storefrontSource('app/item/[slug]/item-detail-wrapper/index.tsx');
		expect(proposalWrapperUsesFilteredServerThenOwnedClient(wrapper)).toBe(true);
		const visibilityCall = callsNamed(wrapper, 'visibleServerProposal')[0];
		expect(visibilityCall?.arguments.map((argument) => argument.getText())).toEqual([
			'item.orderProposal',
			'dismissedServerProposalId',
		]);
		const disconnected = mutatedSource(
			wrapper,
			'visibleServerProposal(item.orderProposal, dismissedServerProposalId)',
			'item.orderProposal',
		);
		expect(callsNamed(disconnected, 'visibleServerProposal')).toHaveLength(0);
		const reversedPriority = mutatedSource(
			wrapper,
			'orderProposal?.id || (ownsCurrentCommerceState ? clientProposalId : undefined) || 0',
			'(ownsCurrentCommerceState ? clientProposalId : undefined) || orderProposal?.id || 0',
		);
		expect(proposalWrapperUsesFilteredServerThenOwnedClient(reversedPriority)).toBe(false);
	});
});
