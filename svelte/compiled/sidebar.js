var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function exclude_internal_props(props) {
        const result = {};
        for (const k in props)
            if (k[0] !== '$')
                result[k] = props[k];
        return result;
    }
    function compute_rest_props(props, keys) {
        const rest = {};
        keys = new Set(keys);
        for (const k in props)
            if (!keys.has(k) && k[0] !== '$')
                rest[k] = props[k];
        return rest;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function stop_propagation(fn) {
        return function (event) {
            event.stopPropagation();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_attributes(node, attributes) {
        // @ts-ignore
        const descriptors = Object.getOwnPropertyDescriptors(node.__proto__);
        for (const key in attributes) {
            if (attributes[key] == null) {
                node.removeAttribute(key);
            }
            else if (key === 'style') {
                node.style.cssText = attributes[key];
            }
            else if (key === '__value') {
                node.value = node[key] = attributes[key];
            }
            else if (descriptors[key] && descriptors[key].set) {
                node[key] = attributes[key];
            }
            else {
                attr(node, key, attributes[key]);
            }
        }
    }
    function set_svg_attributes(node, attributes) {
        for (const key in attributes) {
            attr(node, key, attributes[key]);
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function afterUpdate(fn) {
        get_current_component().$$.after_update.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
    }
    function getContext(key) {
        return get_current_component().$$.context.get(key);
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }
    function validate_each_keys(ctx, list, get_context, get_key) {
        const keys = new Set();
        for (let i = 0; i < list.length; i++) {
            const key = get_key(get_context(ctx, list, i));
            if (keys.has(key)) {
                throw new Error('Cannot have duplicate keys in a keyed each');
            }
            keys.add(key);
        }
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.31.0' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    /* webviews/components/icons/CaretDown.svelte generated by Svelte v3.31.0 */

    const file = "webviews/components/icons/CaretDown.svelte";

    // (24:2) {#if title}
    function create_if_block(ctx) {
    	let title_1;
    	let t;

    	const block = {
    		c: function create() {
    			title_1 = svg_element("title");
    			t = text(/*title*/ ctx[1]);
    			add_location(title_1, file, 23, 13, 549);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, title_1, anchor);
    			append_dev(title_1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*title*/ 2) set_data_dev(t, /*title*/ ctx[1]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(title_1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(24:2) {#if title}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let svg;
    	let path;
    	let if_block = /*title*/ ctx[1] && create_if_block(ctx);

    	let svg_levels = [
    		{ xmlns: "http://www.w3.org/2000/svg" },
    		{ viewBox: "0 0 32 32" },
    		{ fill: "currentColor" },
    		{ preserveAspectRatio: "xMidYMid meet" },
    		{ width: /*size*/ ctx[0] },
    		{ height: /*size*/ ctx[0] },
    		/*attributes*/ ctx[2],
    		/*$$restProps*/ ctx[3]
    	];

    	let svg_data = {};

    	for (let i = 0; i < svg_levels.length; i += 1) {
    		svg_data = assign(svg_data, svg_levels[i]);
    	}

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			if (if_block) if_block.c();
    			path = svg_element("path");
    			attr_dev(path, "d", "M24 12L16 22 8 12z");
    			add_location(path, file, 24, 2, 579);
    			set_svg_attributes(svg, svg_data);
    			add_location(svg, file, 13, 0, 338);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			if (if_block) if_block.m(svg, null);
    			append_dev(svg, path);
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*title*/ ctx[1]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(svg, path);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			set_svg_attributes(svg, svg_data = get_spread_update(svg_levels, [
    				{ xmlns: "http://www.w3.org/2000/svg" },
    				{ viewBox: "0 0 32 32" },
    				{ fill: "currentColor" },
    				{ preserveAspectRatio: "xMidYMid meet" },
    				dirty & /*size*/ 1 && { width: /*size*/ ctx[0] },
    				dirty & /*size*/ 1 && { height: /*size*/ ctx[0] },
    				dirty & /*attributes*/ 4 && /*attributes*/ ctx[2],
    				dirty & /*$$restProps*/ 8 && /*$$restProps*/ ctx[3]
    			]));
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    			if (if_block) if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	const omit_props_names = ["size","title"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("CaretDown", slots, []);
    	let { size = 16 } = $$props;
    	let { title = undefined } = $$props;

    	$$self.$$set = $$new_props => {
    		$$invalidate(5, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(3, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("size" in $$new_props) $$invalidate(0, size = $$new_props.size);
    		if ("title" in $$new_props) $$invalidate(1, title = $$new_props.title);
    	};

    	$$self.$capture_state = () => ({ size, title, labelled, attributes });

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(5, $$props = assign(assign({}, $$props), $$new_props));
    		if ("size" in $$props) $$invalidate(0, size = $$new_props.size);
    		if ("title" in $$props) $$invalidate(1, title = $$new_props.title);
    		if ("labelled" in $$props) $$invalidate(4, labelled = $$new_props.labelled);
    		if ("attributes" in $$props) $$invalidate(2, attributes = $$new_props.attributes);
    	};

    	let labelled;
    	let attributes;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		 $$invalidate(4, labelled = $$props["aria-label"] || $$props["aria-labelledby"] || title);

    		 $$invalidate(2, attributes = {
    			"aria-hidden": labelled ? undefined : true,
    			role: labelled ? "img" : undefined,
    			focusable: Number($$props["tabindex"]) === 0 ? true : undefined
    		});
    	};

    	$$props = exclude_internal_props($$props);
    	return [size, title, attributes, $$restProps, labelled];
    }

    class CaretDown extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { size: 0, title: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "CaretDown",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get size() {
    		throw new Error("<CaretDown>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set size(value) {
    		throw new Error("<CaretDown>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get title() {
    		throw new Error("<CaretDown>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<CaretDown>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* webviews/components/TreeView/TreeViewNode.svelte generated by Svelte v3.31.0 */
    const file$1 = "webviews/components/TreeView/TreeViewNode.svelte";

    // (124:4) {#if ![null, undefined, ''].includes(remark)}
    function create_if_block$1(ctx) {
    	let svg;
    	let path;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr_dev(path, "d", "M625.728 57.472c19.264 0 34.688 6.848 48.128 20.16l208.96 207.04c14.272 13.12 21.568 29.568 21.568 49.28v504.576c0 71.808-56.256 127.744-128.576 127.744H252.16c-72.128 0-128.576-55.68-128.576-127.744V184.704c0-71.68 56.256-127.232 128.576-127.232z m-34.304 76.8H252.16c-30.144 0-51.776 21.376-51.776 50.432v653.824c0 29.44 21.888 50.944 51.776 50.944h523.648c30.016 0 51.84-21.632 51.84-50.944l-0.128-464.512H687.488A96 96 0 0 1 591.936 287.36l-0.448-9.216V134.208zM665.6 704a38.4 38.4 0 0 1 0 76.8H294.4a38.4 38.4 0 0 1 0-76.8h371.2z m0-192a38.4 38.4 0 0 1 0 76.8H294.4a38.4 38.4 0 0 1 0-76.8h371.2z m-192-192a38.4 38.4 0 1 1 0 76.8H294.4a38.4 38.4 0 1 1 0-76.8h179.2z m181.824-152.512v110.592a32 32 0 0 0 26.24 31.488l5.76 0.512h111.872L655.424 167.424z");
    			attr_dev(path, "p-id", "1523");
    			attr_dev(path, "fill", "#8a8a8a");
    			add_location(path, file$1, 124, 150, 3605);
    			attr_dev(svg, "t", "1656661433646");
    			attr_dev(svg, "class", "icon svelte-1bkqnu1");
    			attr_dev(svg, "viewBox", "0 0 1024 1024");
    			attr_dev(svg, "version", "1.1");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "p-id", "1522");
    			attr_dev(svg, "width", "16");
    			attr_dev(svg, "height", "16");
    			add_location(svg, file$1, 124, 6, 3461);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, path);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(124:4) {#if ![null, undefined, ''].includes(remark)}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let li;
    	let div;
    	let switch_instance;
    	let t0;
    	let t1;
    	let t2;
    	let show_if = ![null, undefined, ""].includes(/*remark*/ ctx[2]);
    	let t3;
    	let t4;
    	let li_tabindex_value;
    	let li_aria_current_value;
    	let li_aria_selected_value;
    	let current;
    	let mounted;
    	let dispose;
    	var switch_value = /*icon*/ ctx[4];

    	function switch_props(ctx) {
    		return {
    			props: { class: "bx--tree-node__icon" },
    			$$inline: true
    		};
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props());
    	}

    	let if_block = show_if && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			li = element("li");
    			div = element("div");
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			t0 = space();
    			t1 = text(/*title*/ ctx[1]);
    			t2 = space();
    			if (if_block) if_block.c();
    			t3 = space();
    			t4 = text(/*remark*/ ctx[2]);
    			toggle_class(div, "bx--tree-node__label", true);
    			add_location(div, file$1, 120, 2, 3261);
    			attr_dev(li, "role", "treeitem");
    			attr_dev(li, "resourcepath", /*resourcePath*/ ctx[0]);
    			attr_dev(li, "tabindex", li_tabindex_value = /*disabled*/ ctx[3] ? undefined : -1);
    			attr_dev(li, "aria-current", li_aria_current_value = /*resourcePath*/ ctx[0] === /*$activeNodeId*/ ctx[7] || undefined);

    			attr_dev(li, "aria-selected", li_aria_selected_value = /*disabled*/ ctx[3]
    			? undefined
    			: /*$selectedNodeIds*/ ctx[8].includes(/*resourcePath*/ ctx[0]));

    			attr_dev(li, "aria-disabled", /*disabled*/ ctx[3]);
    			toggle_class(li, "bx--tree-node", true);
    			toggle_class(li, "bx--tree-leaf-node", true);
    			toggle_class(li, "bx--tree-node--active", /*resourcePath*/ ctx[0] === /*$activeNodeId*/ ctx[7]);
    			toggle_class(li, "bx--tree-node--selected", /*$selectedNodeIds*/ ctx[8].includes(/*resourcePath*/ ctx[0]));
    			toggle_class(li, "bx--tree-node--disabled", /*disabled*/ ctx[3]);
    			toggle_class(li, "bx--tree-node--with-icon", /*icon*/ ctx[4]);
    			add_location(li, file$1, 82, 0, 2118);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, div);

    			if (switch_instance) {
    				mount_component(switch_instance, div, null);
    			}

    			append_dev(div, t0);
    			append_dev(div, t1);
    			append_dev(div, t2);
    			if (if_block) if_block.m(div, null);
    			append_dev(div, t3);
    			append_dev(div, t4);
    			/*div_binding*/ ctx[19](div);
    			/*li_binding*/ ctx[20](li);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(li, "click", stop_propagation(/*click_handler*/ ctx[21]), false, false, true),
    					listen_dev(li, "keydown", /*keydown_handler*/ ctx[22], false, false, false),
    					listen_dev(li, "focus", /*focus_handler*/ ctx[23], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (switch_value !== (switch_value = /*icon*/ ctx[4])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props());
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, div, t0);
    				} else {
    					switch_instance = null;
    				}
    			}

    			if (!current || dirty & /*title*/ 2) set_data_dev(t1, /*title*/ ctx[1]);
    			if (dirty & /*remark*/ 4) show_if = ![null, undefined, ""].includes(/*remark*/ ctx[2]);

    			if (show_if) {
    				if (if_block) ; else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					if_block.m(div, t3);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (!current || dirty & /*remark*/ 4) set_data_dev(t4, /*remark*/ ctx[2]);

    			if (!current || dirty & /*resourcePath*/ 1) {
    				attr_dev(li, "resourcepath", /*resourcePath*/ ctx[0]);
    			}

    			if (!current || dirty & /*disabled*/ 8 && li_tabindex_value !== (li_tabindex_value = /*disabled*/ ctx[3] ? undefined : -1)) {
    				attr_dev(li, "tabindex", li_tabindex_value);
    			}

    			if (!current || dirty & /*resourcePath, $activeNodeId*/ 129 && li_aria_current_value !== (li_aria_current_value = /*resourcePath*/ ctx[0] === /*$activeNodeId*/ ctx[7] || undefined)) {
    				attr_dev(li, "aria-current", li_aria_current_value);
    			}

    			if (!current || dirty & /*disabled, $selectedNodeIds, resourcePath*/ 265 && li_aria_selected_value !== (li_aria_selected_value = /*disabled*/ ctx[3]
    			? undefined
    			: /*$selectedNodeIds*/ ctx[8].includes(/*resourcePath*/ ctx[0]))) {
    				attr_dev(li, "aria-selected", li_aria_selected_value);
    			}

    			if (!current || dirty & /*disabled*/ 8) {
    				attr_dev(li, "aria-disabled", /*disabled*/ ctx[3]);
    			}

    			if (dirty & /*resourcePath, $activeNodeId*/ 129) {
    				toggle_class(li, "bx--tree-node--active", /*resourcePath*/ ctx[0] === /*$activeNodeId*/ ctx[7]);
    			}

    			if (dirty & /*$selectedNodeIds, resourcePath*/ 257) {
    				toggle_class(li, "bx--tree-node--selected", /*$selectedNodeIds*/ ctx[8].includes(/*resourcePath*/ ctx[0]));
    			}

    			if (dirty & /*disabled*/ 8) {
    				toggle_class(li, "bx--tree-node--disabled", /*disabled*/ ctx[3]);
    			}

    			if (dirty & /*icon*/ 16) {
    				toggle_class(li, "bx--tree-node--with-icon", /*icon*/ ctx[4]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			if (switch_instance) destroy_component(switch_instance);
    			if (if_block) if_block.d();
    			/*div_binding*/ ctx[19](null);
    			/*li_binding*/ ctx[20](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function computeTreeLeafDepth(node) {
    	let depth = 0;
    	if (node == null) return depth;
    	let parentNode = node.parentNode;

    	while (parentNode != null && parentNode.getAttribute("role") !== "tree") {
    		parentNode = parentNode.parentNode;
    		if (parentNode.tagName === "LI") depth++;
    	}

    	return depth;
    }

    /**
     * Finds the nearest parent tree node
     * @param {HTMLElement} node
     * @returns {null | HTMLElement}
     */
    function findParentTreeNode(node) {
    	if (node.classList.contains("bx--tree-parent-node")) return node;
    	if (node.classList.contains("bx--tree")) return null;
    	return findParentTreeNode(node.parentNode);
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let $activeNodeId;
    	let $selectedNodeIds;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("TreeViewNode", slots, []);
    	let { leaf = false } = $$props;
    	let { resourcePath = "" } = $$props;
    	let { title = "" } = $$props;
    	let { remark = "" } = $$props;
    	let { isFile = false } = $$props;
    	let { isDir = false } = $$props;
    	let { relativePath = "" } = $$props;
    	let { deep = 0 } = $$props;
    	let { disabled = false } = $$props;
    	let { icon = undefined } = $$props;
    	let ref = null;
    	let refLabel = null;
    	let prevActiveId = undefined;
    	const { activeNodeId, selectedNodeIds, clickNode, selectNode, focusNode } = getContext("TreeView");
    	validate_store(activeNodeId, "activeNodeId");
    	component_subscribe($$self, activeNodeId, value => $$invalidate(7, $activeNodeId = value));
    	validate_store(selectedNodeIds, "selectedNodeIds");
    	component_subscribe($$self, selectedNodeIds, value => $$invalidate(8, $selectedNodeIds = value));
    	const offset = () => computeTreeLeafDepth(refLabel) + (leaf && icon ? 2 : 2.5);

    	afterUpdate(() => {
    		if (resourcePath === $activeNodeId && prevActiveId !== $activeNodeId) {
    			if (!$selectedNodeIds.includes(resourcePath)) selectNode(node);
    		}

    		prevActiveId = $activeNodeId;
    	});

    	const writable_props = [
    		"leaf",
    		"resourcePath",
    		"title",
    		"remark",
    		"isFile",
    		"isDir",
    		"relativePath",
    		"deep",
    		"disabled",
    		"icon"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<TreeViewNode> was created with unknown prop '${key}'`);
    	});

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			refLabel = $$value;
    			$$invalidate(5, refLabel);
    		});
    	}

    	function li_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			ref = $$value;
    			$$invalidate(6, ref);
    		});
    	}

    	const click_handler = () => {
    		if (disabled) return;
    		clickNode(node);
    	};

    	const keydown_handler = e => {
    		if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Enter") {
    			e.stopPropagation();
    		}

    		if (e.key === "ArrowLeft") {
    			const parentNode = findParentTreeNode(ref.parentNode);
    			if (parentNode) parentNode.focus();
    		}

    		if (e.key === "Enter" || e.key === " ") {
    			e.preventDefault();
    			if (disabled) return;
    			clickNode(node);
    		}
    	};

    	const focus_handler = () => {
    		focusNode(node);
    	};

    	$$self.$$set = $$props => {
    		if ("leaf" in $$props) $$invalidate(14, leaf = $$props.leaf);
    		if ("resourcePath" in $$props) $$invalidate(0, resourcePath = $$props.resourcePath);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("remark" in $$props) $$invalidate(2, remark = $$props.remark);
    		if ("isFile" in $$props) $$invalidate(15, isFile = $$props.isFile);
    		if ("isDir" in $$props) $$invalidate(16, isDir = $$props.isDir);
    		if ("relativePath" in $$props) $$invalidate(17, relativePath = $$props.relativePath);
    		if ("deep" in $$props) $$invalidate(18, deep = $$props.deep);
    		if ("disabled" in $$props) $$invalidate(3, disabled = $$props.disabled);
    		if ("icon" in $$props) $$invalidate(4, icon = $$props.icon);
    	};

    	$$self.$capture_state = () => ({
    		computeTreeLeafDepth,
    		findParentTreeNode,
    		leaf,
    		resourcePath,
    		title,
    		remark,
    		isFile,
    		isDir,
    		relativePath,
    		deep,
    		disabled,
    		icon,
    		afterUpdate,
    		getContext,
    		ref,
    		refLabel,
    		prevActiveId,
    		activeNodeId,
    		selectedNodeIds,
    		clickNode,
    		selectNode,
    		focusNode,
    		offset,
    		$activeNodeId,
    		$selectedNodeIds,
    		node
    	});

    	$$self.$inject_state = $$props => {
    		if ("leaf" in $$props) $$invalidate(14, leaf = $$props.leaf);
    		if ("resourcePath" in $$props) $$invalidate(0, resourcePath = $$props.resourcePath);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("remark" in $$props) $$invalidate(2, remark = $$props.remark);
    		if ("isFile" in $$props) $$invalidate(15, isFile = $$props.isFile);
    		if ("isDir" in $$props) $$invalidate(16, isDir = $$props.isDir);
    		if ("relativePath" in $$props) $$invalidate(17, relativePath = $$props.relativePath);
    		if ("deep" in $$props) $$invalidate(18, deep = $$props.deep);
    		if ("disabled" in $$props) $$invalidate(3, disabled = $$props.disabled);
    		if ("icon" in $$props) $$invalidate(4, icon = $$props.icon);
    		if ("ref" in $$props) $$invalidate(6, ref = $$props.ref);
    		if ("refLabel" in $$props) $$invalidate(5, refLabel = $$props.refLabel);
    		if ("prevActiveId" in $$props) prevActiveId = $$props.prevActiveId;
    		if ("node" in $$props) $$invalidate(9, node = $$props.node);
    	};

    	let node;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*resourcePath, title, leaf, remark, isFile, isDir, relativePath, deep*/ 507911) {
    			 $$invalidate(9, node = {
    				resourcePath,
    				title,
    				expanded: false,
    				leaf,
    				remark,
    				isFile,
    				isDir,
    				relativePath,
    				deep
    			});
    		}

    		if ($$self.$$.dirty & /*refLabel*/ 32) {
    			 if (refLabel) {
    				$$invalidate(5, refLabel.style.marginLeft = `-${offset()}rem`, refLabel);
    				$$invalidate(5, refLabel.style.paddingLeft = `${offset()}rem`, refLabel);
    			}
    		}
    	};

    	return [
    		resourcePath,
    		title,
    		remark,
    		disabled,
    		icon,
    		refLabel,
    		ref,
    		$activeNodeId,
    		$selectedNodeIds,
    		node,
    		activeNodeId,
    		selectedNodeIds,
    		clickNode,
    		focusNode,
    		leaf,
    		isFile,
    		isDir,
    		relativePath,
    		deep,
    		div_binding,
    		li_binding,
    		click_handler,
    		keydown_handler,
    		focus_handler
    	];
    }

    class TreeViewNode extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
    			leaf: 14,
    			resourcePath: 0,
    			title: 1,
    			remark: 2,
    			isFile: 15,
    			isDir: 16,
    			relativePath: 17,
    			deep: 18,
    			disabled: 3,
    			icon: 4
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TreeViewNode",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get leaf() {
    		throw new Error("<TreeViewNode>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set leaf(value) {
    		throw new Error("<TreeViewNode>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get resourcePath() {
    		throw new Error("<TreeViewNode>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set resourcePath(value) {
    		throw new Error("<TreeViewNode>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get title() {
    		throw new Error("<TreeViewNode>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<TreeViewNode>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get remark() {
    		throw new Error("<TreeViewNode>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set remark(value) {
    		throw new Error("<TreeViewNode>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isFile() {
    		throw new Error("<TreeViewNode>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isFile(value) {
    		throw new Error("<TreeViewNode>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isDir() {
    		throw new Error("<TreeViewNode>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isDir(value) {
    		throw new Error("<TreeViewNode>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get relativePath() {
    		throw new Error("<TreeViewNode>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set relativePath(value) {
    		throw new Error("<TreeViewNode>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get deep() {
    		throw new Error("<TreeViewNode>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set deep(value) {
    		throw new Error("<TreeViewNode>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabled() {
    		throw new Error("<TreeViewNode>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<TreeViewNode>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get icon() {
    		throw new Error("<TreeViewNode>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set icon(value) {
    		throw new Error("<TreeViewNode>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* webviews/components/TreeView/TreeViewNodeList.svelte generated by Svelte v3.31.0 */
    const file$2 = "webviews/components/TreeView/TreeViewNodeList.svelte";

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[35] = list[i];
    	return child_ctx;
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[35] = list[i];
    	return child_ctx;
    }

    // (80:0) {:else}
    function create_else_block_1(ctx) {
    	let li;
    	let div;
    	let span0;
    	let caretdown;
    	let t0;
    	let span1;
    	let switch_instance;
    	let t1;
    	let t2;
    	let t3;
    	let show_if = ![null, undefined, ""].includes(/*remark*/ ctx[5]);
    	let t4;
    	let t5;
    	let t6;
    	let li_tabindex_value;
    	let li_aria_current_value;
    	let li_aria_selected_value;
    	let current;
    	let mounted;
    	let dispose;

    	caretdown = new CaretDown({
    			props: {
    				class: "bx--tree-parent-node__toggle-icon " + (/*expanded*/ ctx[0] && "bx--tree-parent-node__toggle-icon--expanded")
    			},
    			$$inline: true
    		});

    	var switch_value = /*icon*/ ctx[7];

    	function switch_props(ctx) {
    		return {
    			props: { class: "bx--tree-node__icon" },
    			$$inline: true
    		};
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props());
    	}

    	let if_block0 = show_if && create_if_block_4(ctx);
    	let if_block1 = /*expanded*/ ctx[0] && create_if_block_2(ctx);

    	const block = {
    		c: function create() {
    			li = element("li");
    			div = element("div");
    			span0 = element("span");
    			create_component(caretdown.$$.fragment);
    			t0 = space();
    			span1 = element("span");
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			t1 = space();
    			t2 = text(/*title*/ ctx[4]);
    			t3 = space();
    			if (if_block0) if_block0.c();
    			t4 = space();
    			t5 = text(/*remark*/ ctx[5]);
    			t6 = space();
    			if (if_block1) if_block1.c();
    			attr_dev(span0, "disabled", /*disabled*/ ctx[6]);
    			toggle_class(span0, "bx--tree-parent-node__toggle", true);
    			add_location(span0, file$2, 139, 6, 3789);
    			toggle_class(span1, "bx--tree-node__label__details", true);
    			add_location(span1, file$2, 154, 6, 4228);
    			toggle_class(div, "bx--tree-node__label", true);
    			add_location(div, file$2, 138, 4, 3718);
    			attr_dev(li, "role", "treeitem");
    			attr_dev(li, "resourcepath", /*resourcePath*/ ctx[3]);
    			attr_dev(li, "tabindex", li_tabindex_value = /*disabled*/ ctx[6] ? undefined : -1);
    			attr_dev(li, "aria-current", li_aria_current_value = /*resourcePath*/ ctx[3] === /*$activeNodeId*/ ctx[11] || undefined);

    			attr_dev(li, "aria-selected", li_aria_selected_value = /*disabled*/ ctx[6]
    			? undefined
    			: /*$selectedNodeIds*/ ctx[12].includes(/*resourcePath*/ ctx[3]));

    			attr_dev(li, "aria-disabled", /*disabled*/ ctx[6]);
    			attr_dev(li, "aria-expanded", /*expanded*/ ctx[0]);
    			toggle_class(li, "bx--tree-node", true);
    			toggle_class(li, "bx--tree-parent-node", true);
    			toggle_class(li, "bx--tree-node--active", /*resourcePath*/ ctx[3] === /*$activeNodeId*/ ctx[11]);
    			toggle_class(li, "bx--tree-node--selected", /*$selectedNodeIds*/ ctx[12].includes(/*resourcePath*/ ctx[3]));
    			toggle_class(li, "bx--tree-node--disabled", /*disabled*/ ctx[6]);
    			toggle_class(li, "bx--tree-node--with-icon", /*icon*/ ctx[7]);
    			add_location(li, file$2, 80, 2, 2090);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, div);
    			append_dev(div, span0);
    			mount_component(caretdown, span0, null);
    			append_dev(div, t0);
    			append_dev(div, span1);

    			if (switch_instance) {
    				mount_component(switch_instance, span1, null);
    			}

    			append_dev(span1, t1);
    			append_dev(span1, t2);
    			append_dev(span1, t3);
    			if (if_block0) if_block0.m(span1, null);
    			append_dev(span1, t4);
    			append_dev(span1, t5);
    			/*div_binding*/ ctx[27](div);
    			append_dev(li, t6);
    			if (if_block1) if_block1.m(li, null);
    			/*li_binding*/ ctx[28](li);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(span0, "click", /*click_handler*/ ctx[26], false, false, false),
    					listen_dev(li, "click", stop_propagation(/*click_handler_1*/ ctx[29]), false, false, true),
    					listen_dev(li, "keydown", /*keydown_handler*/ ctx[30], false, false, false),
    					listen_dev(li, "focus", /*focus_handler*/ ctx[31], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			const caretdown_changes = {};
    			if (dirty[0] & /*expanded*/ 1) caretdown_changes.class = "bx--tree-parent-node__toggle-icon " + (/*expanded*/ ctx[0] && "bx--tree-parent-node__toggle-icon--expanded");
    			caretdown.$set(caretdown_changes);

    			if (!current || dirty[0] & /*disabled*/ 64) {
    				attr_dev(span0, "disabled", /*disabled*/ ctx[6]);
    			}

    			if (switch_value !== (switch_value = /*icon*/ ctx[7])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props());
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, span1, t1);
    				} else {
    					switch_instance = null;
    				}
    			}

    			if (!current || dirty[0] & /*title*/ 16) set_data_dev(t2, /*title*/ ctx[4]);
    			if (dirty[0] & /*remark*/ 32) show_if = ![null, undefined, ""].includes(/*remark*/ ctx[5]);

    			if (show_if) {
    				if (if_block0) ; else {
    					if_block0 = create_if_block_4(ctx);
    					if_block0.c();
    					if_block0.m(span1, t4);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (!current || dirty[0] & /*remark*/ 32) set_data_dev(t5, /*remark*/ ctx[5]);

    			if (/*expanded*/ ctx[0]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*expanded*/ 1) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_2(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(li, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty[0] & /*resourcePath*/ 8) {
    				attr_dev(li, "resourcepath", /*resourcePath*/ ctx[3]);
    			}

    			if (!current || dirty[0] & /*disabled*/ 64 && li_tabindex_value !== (li_tabindex_value = /*disabled*/ ctx[6] ? undefined : -1)) {
    				attr_dev(li, "tabindex", li_tabindex_value);
    			}

    			if (!current || dirty[0] & /*resourcePath, $activeNodeId*/ 2056 && li_aria_current_value !== (li_aria_current_value = /*resourcePath*/ ctx[3] === /*$activeNodeId*/ ctx[11] || undefined)) {
    				attr_dev(li, "aria-current", li_aria_current_value);
    			}

    			if (!current || dirty[0] & /*disabled, $selectedNodeIds, resourcePath*/ 4168 && li_aria_selected_value !== (li_aria_selected_value = /*disabled*/ ctx[6]
    			? undefined
    			: /*$selectedNodeIds*/ ctx[12].includes(/*resourcePath*/ ctx[3]))) {
    				attr_dev(li, "aria-selected", li_aria_selected_value);
    			}

    			if (!current || dirty[0] & /*disabled*/ 64) {
    				attr_dev(li, "aria-disabled", /*disabled*/ ctx[6]);
    			}

    			if (!current || dirty[0] & /*expanded*/ 1) {
    				attr_dev(li, "aria-expanded", /*expanded*/ ctx[0]);
    			}

    			if (dirty[0] & /*resourcePath, $activeNodeId*/ 2056) {
    				toggle_class(li, "bx--tree-node--active", /*resourcePath*/ ctx[3] === /*$activeNodeId*/ ctx[11]);
    			}

    			if (dirty[0] & /*$selectedNodeIds, resourcePath*/ 4104) {
    				toggle_class(li, "bx--tree-node--selected", /*$selectedNodeIds*/ ctx[12].includes(/*resourcePath*/ ctx[3]));
    			}

    			if (dirty[0] & /*disabled*/ 64) {
    				toggle_class(li, "bx--tree-node--disabled", /*disabled*/ ctx[6]);
    			}

    			if (dirty[0] & /*icon*/ 128) {
    				toggle_class(li, "bx--tree-node--with-icon", /*icon*/ ctx[7]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(caretdown.$$.fragment, local);
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(caretdown.$$.fragment, local);
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			destroy_component(caretdown);
    			if (switch_instance) destroy_component(switch_instance);
    			if (if_block0) if_block0.d();
    			/*div_binding*/ ctx[27](null);
    			if (if_block1) if_block1.d();
    			/*li_binding*/ ctx[28](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_1.name,
    		type: "else",
    		source: "(80:0) {:else}",
    		ctx
    	});

    	return block;
    }

    // (72:0) {#if root}
    function create_if_block$2(ctx) {
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let each_1_anchor;
    	let current;
    	let each_value = /*children*/ ctx[1];
    	validate_each_argument(each_value);
    	const get_key = ctx => /*child*/ ctx[35].resourcePath;
    	validate_each_keys(ctx, each_value, get_each_context, get_key);

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*children*/ 2) {
    				const each_value = /*children*/ ctx[1];
    				validate_each_argument(each_value);
    				group_outros();
    				validate_each_keys(ctx, each_value, get_each_context, get_key);
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, each_1_anchor.parentNode, outro_and_destroy_block, create_each_block, each_1_anchor, get_each_context);
    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(72:0) {#if root}",
    		ctx
    	});

    	return block;
    }

    // (158:8) {#if ![null, undefined, ''].includes(remark)}
    function create_if_block_4(ctx) {
    	let svg;
    	let path;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr_dev(path, "d", "M625.728 57.472c19.264 0 34.688 6.848 48.128 20.16l208.96 207.04c14.272 13.12 21.568 29.568 21.568 49.28v504.576c0 71.808-56.256 127.744-128.576 127.744H252.16c-72.128 0-128.576-55.68-128.576-127.744V184.704c0-71.68 56.256-127.232 128.576-127.232z m-34.304 76.8H252.16c-30.144 0-51.776 21.376-51.776 50.432v653.824c0 29.44 21.888 50.944 51.776 50.944h523.648c30.016 0 51.84-21.632 51.84-50.944l-0.128-464.512H687.488A96 96 0 0 1 591.936 287.36l-0.448-9.216V134.208zM665.6 704a38.4 38.4 0 0 1 0 76.8H294.4a38.4 38.4 0 0 1 0-76.8h371.2z m0-192a38.4 38.4 0 0 1 0 76.8H294.4a38.4 38.4 0 0 1 0-76.8h371.2z m-192-192a38.4 38.4 0 1 1 0 76.8H294.4a38.4 38.4 0 1 1 0-76.8h179.2z m181.824-152.512v110.592a32 32 0 0 0 26.24 31.488l5.76 0.512h111.872L655.424 167.424z");
    			attr_dev(path, "p-id", "1523");
    			attr_dev(path, "fill", "#8a8a8a");
    			add_location(path, file$2, 158, 154, 4575);
    			attr_dev(svg, "t", "1656661433646");
    			attr_dev(svg, "class", "icon");
    			attr_dev(svg, "viewBox", "0 0 1024 1024");
    			attr_dev(svg, "version", "1.1");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "p-id", "1522");
    			attr_dev(svg, "width", "16");
    			attr_dev(svg, "height", "16");
    			add_location(svg, file$2, 158, 10, 4431);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, path);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(158:8) {#if ![null, undefined, ''].includes(remark)}",
    		ctx
    	});

    	return block;
    }

    // (164:4) {#if expanded}
    function create_if_block_2(ctx) {
    	let ul;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	let each_value_1 = /*children*/ ctx[1];
    	validate_each_argument(each_value_1);
    	const get_key = ctx => /*child*/ ctx[35].resourcePath;
    	validate_each_keys(ctx, each_value_1, get_each_context_1, get_key);

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		let child_ctx = get_each_context_1(ctx, each_value_1, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block_1(key, child_ctx));
    	}

    	const block = {
    		c: function create() {
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(ul, "role", "group");
    			toggle_class(ul, "bx--tree-node__children", true);
    			add_location(ul, file$2, 164, 6, 5463);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*children*/ 2) {
    				const each_value_1 = /*children*/ ctx[1];
    				validate_each_argument(each_value_1);
    				group_outros();
    				validate_each_keys(ctx, each_value_1, get_each_context_1, get_key);
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value_1, each_1_lookup, ul, outro_and_destroy_block, create_each_block_1, null, get_each_context_1);
    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value_1.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(164:4) {#if expanded}",
    		ctx
    	});

    	return block;
    }

    // (169:10) {:else}
    function create_else_block_2(ctx) {
    	let treeviewnode;
    	let current;
    	const treeviewnode_spread_levels = [{ leaf: true }, /*child*/ ctx[35]];
    	let treeviewnode_props = {};

    	for (let i = 0; i < treeviewnode_spread_levels.length; i += 1) {
    		treeviewnode_props = assign(treeviewnode_props, treeviewnode_spread_levels[i]);
    	}

    	treeviewnode = new TreeViewNode({
    			props: treeviewnode_props,
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(treeviewnode.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(treeviewnode, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const treeviewnode_changes = (dirty[0] & /*children*/ 2)
    			? get_spread_update(treeviewnode_spread_levels, [treeviewnode_spread_levels[0], get_spread_object(/*child*/ ctx[35])])
    			: {};

    			treeviewnode.$set(treeviewnode_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(treeviewnode.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(treeviewnode.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(treeviewnode, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_2.name,
    		type: "else",
    		source: "(169:10) {:else}",
    		ctx
    	});

    	return block;
    }

    // (167:10) {#if Array.isArray(child.children)}
    function create_if_block_3(ctx) {
    	let treeviewnodelist;
    	let current;
    	const treeviewnodelist_spread_levels = [/*child*/ ctx[35]];
    	let treeviewnodelist_props = {};

    	for (let i = 0; i < treeviewnodelist_spread_levels.length; i += 1) {
    		treeviewnodelist_props = assign(treeviewnodelist_props, treeviewnodelist_spread_levels[i]);
    	}

    	treeviewnodelist = new TreeViewNodeList({
    			props: treeviewnodelist_props,
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(treeviewnodelist.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(treeviewnodelist, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const treeviewnodelist_changes = (dirty[0] & /*children*/ 2)
    			? get_spread_update(treeviewnodelist_spread_levels, [get_spread_object(/*child*/ ctx[35])])
    			: {};

    			treeviewnodelist.$set(treeviewnodelist_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(treeviewnodelist.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(treeviewnodelist.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(treeviewnodelist, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(167:10) {#if Array.isArray(child.children)}",
    		ctx
    	});

    	return block;
    }

    // (166:8) {#each children as child (child.resourcePath)}
    function create_each_block_1(key_1, ctx) {
    	let first;
    	let show_if;
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_3, create_else_block_2];
    	const if_blocks = [];

    	function select_block_type_2(ctx, dirty) {
    		if (dirty[0] & /*children*/ 2) show_if = !!Array.isArray(/*child*/ ctx[35].children);
    		if (show_if) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_2(ctx, [-1]);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			first = empty();
    			if_block.c();
    			if_block_anchor = empty();
    			this.first = first;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, first, anchor);
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_2(ctx, dirty);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(first);
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(166:8) {#each children as child (child.resourcePath)}",
    		ctx
    	});

    	return block;
    }

    // (76:4) {:else}
    function create_else_block(ctx) {
    	let treeviewnode;
    	let current;
    	const treeviewnode_spread_levels = [{ leaf: true }, /*child*/ ctx[35]];
    	let treeviewnode_props = {};

    	for (let i = 0; i < treeviewnode_spread_levels.length; i += 1) {
    		treeviewnode_props = assign(treeviewnode_props, treeviewnode_spread_levels[i]);
    	}

    	treeviewnode = new TreeViewNode({
    			props: treeviewnode_props,
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(treeviewnode.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(treeviewnode, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const treeviewnode_changes = (dirty[0] & /*children*/ 2)
    			? get_spread_update(treeviewnode_spread_levels, [treeviewnode_spread_levels[0], get_spread_object(/*child*/ ctx[35])])
    			: {};

    			treeviewnode.$set(treeviewnode_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(treeviewnode.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(treeviewnode.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(treeviewnode, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(76:4) {:else}",
    		ctx
    	});

    	return block;
    }

    // (74:4) {#if Array.isArray(child.children)}
    function create_if_block_1(ctx) {
    	let treeviewnodelist;
    	let current;
    	const treeviewnodelist_spread_levels = [/*child*/ ctx[35]];
    	let treeviewnodelist_props = {};

    	for (let i = 0; i < treeviewnodelist_spread_levels.length; i += 1) {
    		treeviewnodelist_props = assign(treeviewnodelist_props, treeviewnodelist_spread_levels[i]);
    	}

    	treeviewnodelist = new TreeViewNodeList({
    			props: treeviewnodelist_props,
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(treeviewnodelist.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(treeviewnodelist, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const treeviewnodelist_changes = (dirty[0] & /*children*/ 2)
    			? get_spread_update(treeviewnodelist_spread_levels, [get_spread_object(/*child*/ ctx[35])])
    			: {};

    			treeviewnodelist.$set(treeviewnodelist_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(treeviewnodelist.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(treeviewnodelist.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(treeviewnodelist, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(74:4) {#if Array.isArray(child.children)}",
    		ctx
    	});

    	return block;
    }

    // (73:2) {#each children as child (child.resourcePath)}
    function create_each_block(key_1, ctx) {
    	let first;
    	let show_if;
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_1, create_else_block];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (dirty[0] & /*children*/ 2) show_if = !!Array.isArray(/*child*/ ctx[35].children);
    		if (show_if) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_1(ctx, [-1]);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			first = empty();
    			if_block.c();
    			if_block_anchor = empty();
    			this.first = first;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, first, anchor);
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx, dirty);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(first);
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(73:2) {#each children as child (child.resourcePath)}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$2, create_else_block_1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*root*/ ctx[2]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let $activeNodeId;
    	let $selectedNodeIds;
    	let $expandedNodeIds;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("TreeViewNodeList", slots, []);
    	let { children = [] } = $$props;
    	let { expanded = false } = $$props;
    	let { root = false } = $$props;
    	let { resourcePath = "" } = $$props;
    	let { title = "" } = $$props;
    	let { remark = "" } = $$props;
    	let { isFile = false } = $$props;
    	let { isDir = false } = $$props;
    	let { relativePath = "" } = $$props;
    	let { deep = 0 } = $$props;
    	let { disabled = false } = $$props;
    	let { icon = undefined } = $$props;
    	let ref = null;
    	let refLabel = null;
    	let prevActiveId = undefined;
    	const { activeNodeId, selectedNodeIds, expandedNodeIds, clickNode, selectNode, expandNode, focusNode, toggleNode } = getContext("TreeView");
    	validate_store(activeNodeId, "activeNodeId");
    	component_subscribe($$self, activeNodeId, value => $$invalidate(11, $activeNodeId = value));
    	validate_store(selectedNodeIds, "selectedNodeIds");
    	component_subscribe($$self, selectedNodeIds, value => $$invalidate(12, $selectedNodeIds = value));
    	validate_store(expandedNodeIds, "expandedNodeIds");
    	component_subscribe($$self, expandedNodeIds, value => $$invalidate(25, $expandedNodeIds = value));

    	const offset = () => {
    		const depth = computeTreeLeafDepth(refLabel);
    		if (parent) return depth + 1;
    		if (icon) return depth + 2;
    		return depth + 2.5;
    	};

    	afterUpdate(() => {
    		if (resourcePath === $activeNodeId && prevActiveId !== $activeNodeId) {
    			if (!$selectedNodeIds.includes(resourcePath)) selectNode(node);
    		}

    		prevActiveId = $activeNodeId;
    	});

    	const writable_props = [
    		"children",
    		"expanded",
    		"root",
    		"resourcePath",
    		"title",
    		"remark",
    		"isFile",
    		"isDir",
    		"relativePath",
    		"deep",
    		"disabled",
    		"icon"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<TreeViewNodeList> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => {
    		if (disabled) return;
    		$$invalidate(0, expanded = !expanded);
    		expandNode(node, expanded);
    		toggleNode(node);
    	};

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			refLabel = $$value;
    			$$invalidate(8, refLabel);
    		});
    	}

    	function li_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			ref = $$value;
    			$$invalidate(10, ref);
    		});
    	}

    	const click_handler_1 = () => {
    		if (disabled) return;
    		clickNode(node);
    	};

    	const keydown_handler = e => {
    		if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Enter") {
    			e.stopPropagation();
    		}

    		if (parent && e.key === "ArrowLeft") {
    			$$invalidate(0, expanded = false);
    			expandNode(node, false);
    			toggleNode(node);
    		}

    		if (parent && e.key === "ArrowRight") {
    			if (expanded) {
    				ref.lastChild.firstElementChild?.focus();
    			} else {
    				$$invalidate(0, expanded = true);
    				expandNode(node, true);
    				toggleNode(node);
    			}
    		}

    		if (e.key === "Enter" || e.key === " ") {
    			e.preventDefault();
    			if (disabled) return;
    			$$invalidate(0, expanded = !expanded);
    			toggleNode(node);
    			clickNode(node);
    			expandNode(node, expanded);
    			ref.focus();
    		}
    	};

    	const focus_handler = () => {
    		focusNode(node);
    	};

    	$$self.$$set = $$props => {
    		if ("children" in $$props) $$invalidate(1, children = $$props.children);
    		if ("expanded" in $$props) $$invalidate(0, expanded = $$props.expanded);
    		if ("root" in $$props) $$invalidate(2, root = $$props.root);
    		if ("resourcePath" in $$props) $$invalidate(3, resourcePath = $$props.resourcePath);
    		if ("title" in $$props) $$invalidate(4, title = $$props.title);
    		if ("remark" in $$props) $$invalidate(5, remark = $$props.remark);
    		if ("isFile" in $$props) $$invalidate(21, isFile = $$props.isFile);
    		if ("isDir" in $$props) $$invalidate(22, isDir = $$props.isDir);
    		if ("relativePath" in $$props) $$invalidate(23, relativePath = $$props.relativePath);
    		if ("deep" in $$props) $$invalidate(24, deep = $$props.deep);
    		if ("disabled" in $$props) $$invalidate(6, disabled = $$props.disabled);
    		if ("icon" in $$props) $$invalidate(7, icon = $$props.icon);
    	};

    	$$self.$capture_state = () => ({
    		children,
    		expanded,
    		root,
    		resourcePath,
    		title,
    		remark,
    		isFile,
    		isDir,
    		relativePath,
    		deep,
    		disabled,
    		icon,
    		afterUpdate,
    		getContext,
    		CaretDown,
    		TreeViewNode,
    		computeTreeLeafDepth,
    		ref,
    		refLabel,
    		prevActiveId,
    		activeNodeId,
    		selectedNodeIds,
    		expandedNodeIds,
    		clickNode,
    		selectNode,
    		expandNode,
    		focusNode,
    		toggleNode,
    		offset,
    		parent,
    		$activeNodeId,
    		$selectedNodeIds,
    		node,
    		$expandedNodeIds
    	});

    	$$self.$inject_state = $$props => {
    		if ("children" in $$props) $$invalidate(1, children = $$props.children);
    		if ("expanded" in $$props) $$invalidate(0, expanded = $$props.expanded);
    		if ("root" in $$props) $$invalidate(2, root = $$props.root);
    		if ("resourcePath" in $$props) $$invalidate(3, resourcePath = $$props.resourcePath);
    		if ("title" in $$props) $$invalidate(4, title = $$props.title);
    		if ("remark" in $$props) $$invalidate(5, remark = $$props.remark);
    		if ("isFile" in $$props) $$invalidate(21, isFile = $$props.isFile);
    		if ("isDir" in $$props) $$invalidate(22, isDir = $$props.isDir);
    		if ("relativePath" in $$props) $$invalidate(23, relativePath = $$props.relativePath);
    		if ("deep" in $$props) $$invalidate(24, deep = $$props.deep);
    		if ("disabled" in $$props) $$invalidate(6, disabled = $$props.disabled);
    		if ("icon" in $$props) $$invalidate(7, icon = $$props.icon);
    		if ("ref" in $$props) $$invalidate(10, ref = $$props.ref);
    		if ("refLabel" in $$props) $$invalidate(8, refLabel = $$props.refLabel);
    		if ("prevActiveId" in $$props) prevActiveId = $$props.prevActiveId;
    		if ("parent" in $$props) $$invalidate(9, parent = $$props.parent);
    		if ("node" in $$props) $$invalidate(13, node = $$props.node);
    	};

    	let parent;
    	let node;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*children*/ 2) {
    			 $$invalidate(9, parent = Array.isArray(children));
    		}

    		if ($$self.$$.dirty[0] & /*$expandedNodeIds, resourcePath*/ 33554440) {
    			 $$invalidate(0, expanded = $expandedNodeIds.includes(resourcePath));
    		}

    		if ($$self.$$.dirty[0] & /*resourcePath, title, expanded, parent, remark, isFile, isDir, relativePath, deep*/ 31457849) {
    			 $$invalidate(13, node = {
    				resourcePath,
    				title,
    				expanded,
    				leaf: !parent,
    				remark,
    				isFile,
    				isDir,
    				relativePath,
    				deep
    			});
    		}

    		if ($$self.$$.dirty[0] & /*refLabel*/ 256) {
    			 if (refLabel) {
    				$$invalidate(8, refLabel.style.marginLeft = `-${offset()}rem`, refLabel);
    				$$invalidate(8, refLabel.style.paddingLeft = `${offset()}rem`, refLabel);
    			}
    		}
    	};

    	return [
    		expanded,
    		children,
    		root,
    		resourcePath,
    		title,
    		remark,
    		disabled,
    		icon,
    		refLabel,
    		parent,
    		ref,
    		$activeNodeId,
    		$selectedNodeIds,
    		node,
    		activeNodeId,
    		selectedNodeIds,
    		expandedNodeIds,
    		clickNode,
    		expandNode,
    		focusNode,
    		toggleNode,
    		isFile,
    		isDir,
    		relativePath,
    		deep,
    		$expandedNodeIds,
    		click_handler,
    		div_binding,
    		li_binding,
    		click_handler_1,
    		keydown_handler,
    		focus_handler
    	];
    }

    class TreeViewNodeList extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance$2,
    			create_fragment$2,
    			safe_not_equal,
    			{
    				children: 1,
    				expanded: 0,
    				root: 2,
    				resourcePath: 3,
    				title: 4,
    				remark: 5,
    				isFile: 21,
    				isDir: 22,
    				relativePath: 23,
    				deep: 24,
    				disabled: 6,
    				icon: 7
    			},
    			[-1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TreeViewNodeList",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get children() {
    		throw new Error("<TreeViewNodeList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set children(value) {
    		throw new Error("<TreeViewNodeList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get expanded() {
    		throw new Error("<TreeViewNodeList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set expanded(value) {
    		throw new Error("<TreeViewNodeList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get root() {
    		throw new Error("<TreeViewNodeList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set root(value) {
    		throw new Error("<TreeViewNodeList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get resourcePath() {
    		throw new Error("<TreeViewNodeList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set resourcePath(value) {
    		throw new Error("<TreeViewNodeList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get title() {
    		throw new Error("<TreeViewNodeList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<TreeViewNodeList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get remark() {
    		throw new Error("<TreeViewNodeList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set remark(value) {
    		throw new Error("<TreeViewNodeList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isFile() {
    		throw new Error("<TreeViewNodeList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isFile(value) {
    		throw new Error("<TreeViewNodeList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isDir() {
    		throw new Error("<TreeViewNodeList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isDir(value) {
    		throw new Error("<TreeViewNodeList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get relativePath() {
    		throw new Error("<TreeViewNodeList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set relativePath(value) {
    		throw new Error("<TreeViewNodeList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get deep() {
    		throw new Error("<TreeViewNodeList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set deep(value) {
    		throw new Error("<TreeViewNodeList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabled() {
    		throw new Error("<TreeViewNodeList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<TreeViewNodeList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get icon() {
    		throw new Error("<TreeViewNodeList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set icon(value) {
    		throw new Error("<TreeViewNodeList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* webviews/components/TreeView/TreeView.svelte generated by Svelte v3.31.0 */
    const file$3 = "webviews/components/TreeView/TreeView.svelte";

    // (184:0) {#if !hideLabel}
    function create_if_block$3(ctx) {
    	const block = { c: noop, m: noop, d: noop };

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(184:0) {#if !hideLabel}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let t;
    	let ul;
    	let treeviewnodelist;
    	let ul_aria_label_value;
    	let ul_aria_labelledby_value;
    	let ul_aria_multiselectable_value;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block = !/*hideLabel*/ ctx[4] && create_if_block$3(ctx);

    	treeviewnodelist = new TreeViewNodeList({
    			props: {
    				root: true,
    				children: /*children*/ ctx[1]
    			},
    			$$inline: true
    		});

    	let ul_levels = [
    		/*$$restProps*/ ctx[8],
    		{ role: "tree" },
    		{
    			"aria-label": ul_aria_label_value = /*hideLabel*/ ctx[4] ? /*labelText*/ ctx[3] : undefined
    		},
    		{
    			"aria-labelledby": ul_aria_labelledby_value = !/*hideLabel*/ ctx[4] ? /*labelId*/ ctx[6] : undefined
    		},
    		{
    			"aria-multiselectable": ul_aria_multiselectable_value = /*selectedIds*/ ctx[0].length > 1 || undefined
    		}
    	];

    	let ul_data = {};

    	for (let i = 0; i < ul_levels.length; i += 1) {
    		ul_data = assign(ul_data, ul_levels[i]);
    	}

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			t = space();
    			ul = element("ul");
    			create_component(treeviewnodelist.$$.fragment);
    			set_attributes(ul, ul_data);
    			toggle_class(ul, "bx--tree", true);
    			toggle_class(ul, "bx--tree--default", /*size*/ ctx[2] === "default");
    			toggle_class(ul, "bx--tree--compact", /*size*/ ctx[2] === "compact");
    			add_location(ul, file$3, 190, 0, 5180);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, t, anchor);
    			insert_dev(target, ul, anchor);
    			mount_component(treeviewnodelist, ul, null);
    			/*ul_binding*/ ctx[17](ul);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(ul, "keydown", /*keydown_handler*/ ctx[16], false, false, false),
    					listen_dev(ul, "keydown", stop_propagation(/*handleKeyDown*/ ctx[7]), false, false, true)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (!/*hideLabel*/ ctx[4]) {
    				if (if_block) ; else {
    					if_block = create_if_block$3(ctx);
    					if_block.c();
    					if_block.m(t.parentNode, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			const treeviewnodelist_changes = {};
    			if (dirty & /*children*/ 2) treeviewnodelist_changes.children = /*children*/ ctx[1];
    			treeviewnodelist.$set(treeviewnodelist_changes);

    			set_attributes(ul, ul_data = get_spread_update(ul_levels, [
    				dirty & /*$$restProps*/ 256 && /*$$restProps*/ ctx[8],
    				{ role: "tree" },
    				(!current || dirty & /*hideLabel, labelText*/ 24 && ul_aria_label_value !== (ul_aria_label_value = /*hideLabel*/ ctx[4] ? /*labelText*/ ctx[3] : undefined)) && { "aria-label": ul_aria_label_value },
    				(!current || dirty & /*hideLabel*/ 16 && ul_aria_labelledby_value !== (ul_aria_labelledby_value = !/*hideLabel*/ ctx[4] ? /*labelId*/ ctx[6] : undefined)) && {
    					"aria-labelledby": ul_aria_labelledby_value
    				},
    				(!current || dirty & /*selectedIds*/ 1 && ul_aria_multiselectable_value !== (ul_aria_multiselectable_value = /*selectedIds*/ ctx[0].length > 1 || undefined)) && {
    					"aria-multiselectable": ul_aria_multiselectable_value
    				}
    			]));

    			toggle_class(ul, "bx--tree", true);
    			toggle_class(ul, "bx--tree--default", /*size*/ ctx[2] === "default");
    			toggle_class(ul, "bx--tree--compact", /*size*/ ctx[2] === "compact");
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(treeviewnodelist.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(treeviewnodelist.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(t);
    			if (detaching) detach_dev(ul);
    			destroy_component(treeviewnodelist);
    			/*ul_binding*/ ctx[17](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"children","activeId","selectedIds","expandedIds","size","labelText","hideLabel","expandAll","collapseAll","expandNodes","collapseNodes"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("TreeView", slots, []);
    	let { children = [] } = $$props;
    	let { activeId = "" } = $$props;
    	let { selectedIds = [] } = $$props;
    	let { expandedIds = [] } = $$props;
    	let { size = "default" } = $$props;
    	let { labelText = "" } = $$props;
    	let { hideLabel = false } = $$props;

    	function expandAll() {
    		$$invalidate(10, expandedIds = [...nodeIds]);
    	}

    	function collapseAll() {
    		$$invalidate(10, expandedIds = []);
    	}

    	function expandNodes(filterNode = node => false) {
    		$$invalidate(10, expandedIds = nodes.filter(node => filterNode(node) || node.children?.some(child => filterNode(child) && child.children)).map(node => node.resourcePath));
    	}

    	function collapseNodes(filterNode = node => true) {
    		$$invalidate(10, expandedIds = nodes.filter(node => expandedIds.includes(node.resourcePath) && !filterNode(node)).map(node => node.resourcePath));
    	}

    	const dispatch = createEventDispatcher();
    	const labelId = `label-${Math.random().toString(36)}`;
    	const activeNodeId = writable(activeId);
    	const selectedNodeIds = writable(selectedIds);
    	const expandedNodeIds = writable(expandedIds);
    	let ref = null;
    	let treeWalker = null;

    	setContext("TreeView", {
    		activeNodeId,
    		selectedNodeIds,
    		expandedNodeIds,
    		clickNode: node => {
    			$$invalidate(9, activeId = node.resourcePath);
    			$$invalidate(0, selectedIds = [node.resourcePath]);
    			dispatch("select", node);
    		},
    		selectNode: node => {
    			$$invalidate(0, selectedIds = [node.resourcePath]);
    		},
    		expandNode: (node, expanded) => {
    			if (expanded) {
    				$$invalidate(10, expandedIds = [...expandedIds, node.resourcePath]);
    			} else {
    				$$invalidate(10, expandedIds = expandedIds.filter(_id => _id !== node.resourcePath));
    			}
    		},
    		focusNode: node => dispatch("focus", node),
    		toggleNode: node => dispatch("toggle", node)
    	});

    	function handleKeyDown(e) {
    		if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
    		treeWalker.currentNode = e.target;
    		let node = null;
    		if (e.key === "ArrowUp") node = treeWalker.previousNode();
    		if (e.key === "ArrowDown") node = treeWalker.nextNode();

    		if (node && node !== e.target) {
    			node.tabIndex = "0";
    			node.focus();
    		}
    	}

    	onMount(() => {
    		const firstFocusableNode = ref.querySelector("li.bx--tree-node:not(.bx--tree-node--disabled)");

    		if (firstFocusableNode != null) {
    			firstFocusableNode.tabIndex = "0";
    		}
    	});

    	/**
     * @param {Array<TreeNode & { children?: TreeNode[] }>} children
     */
    	function traverse(children) {
    		let nodes = [];

    		children.forEach(node => {
    			nodes.push(node);

    			if (Array.isArray(node.children)) {
    				nodes = [...nodes, ...traverse(node.children)];
    			}
    		});

    		return nodes;
    	}

    	function keydown_handler(event) {
    		bubble($$self, event);
    	}

    	function ul_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			ref = $$value;
    			$$invalidate(5, ref);
    		});
    	}

    	$$self.$$set = $$new_props => {
    		$$props = assign(assign({}, $$props), exclude_internal_props($$new_props));
    		$$invalidate(8, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("children" in $$new_props) $$invalidate(1, children = $$new_props.children);
    		if ("activeId" in $$new_props) $$invalidate(9, activeId = $$new_props.activeId);
    		if ("selectedIds" in $$new_props) $$invalidate(0, selectedIds = $$new_props.selectedIds);
    		if ("expandedIds" in $$new_props) $$invalidate(10, expandedIds = $$new_props.expandedIds);
    		if ("size" in $$new_props) $$invalidate(2, size = $$new_props.size);
    		if ("labelText" in $$new_props) $$invalidate(3, labelText = $$new_props.labelText);
    		if ("hideLabel" in $$new_props) $$invalidate(4, hideLabel = $$new_props.hideLabel);
    	};

    	$$self.$capture_state = () => ({
    		children,
    		activeId,
    		selectedIds,
    		expandedIds,
    		size,
    		labelText,
    		hideLabel,
    		expandAll,
    		collapseAll,
    		expandNodes,
    		collapseNodes,
    		createEventDispatcher,
    		setContext,
    		onMount,
    		writable,
    		TreeViewNodeList,
    		dispatch,
    		labelId,
    		activeNodeId,
    		selectedNodeIds,
    		expandedNodeIds,
    		ref,
    		treeWalker,
    		handleKeyDown,
    		traverse,
    		nodeIds,
    		nodes
    	});

    	$$self.$inject_state = $$new_props => {
    		if ("children" in $$props) $$invalidate(1, children = $$new_props.children);
    		if ("activeId" in $$props) $$invalidate(9, activeId = $$new_props.activeId);
    		if ("selectedIds" in $$props) $$invalidate(0, selectedIds = $$new_props.selectedIds);
    		if ("expandedIds" in $$props) $$invalidate(10, expandedIds = $$new_props.expandedIds);
    		if ("size" in $$props) $$invalidate(2, size = $$new_props.size);
    		if ("labelText" in $$props) $$invalidate(3, labelText = $$new_props.labelText);
    		if ("hideLabel" in $$props) $$invalidate(4, hideLabel = $$new_props.hideLabel);
    		if ("ref" in $$props) $$invalidate(5, ref = $$new_props.ref);
    		if ("treeWalker" in $$props) treeWalker = $$new_props.treeWalker;
    		if ("nodeIds" in $$props) nodeIds = $$new_props.nodeIds;
    		if ("nodes" in $$props) $$invalidate(15, nodes = $$new_props.nodes);
    	};

    	let nodes;
    	let nodeIds;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*children*/ 2) {
    			 $$invalidate(15, nodes = traverse(children));
    		}

    		if ($$self.$$.dirty & /*nodes*/ 32768) {
    			 nodeIds = nodes.map(node => node.resourcePath);
    		}

    		if ($$self.$$.dirty & /*activeId*/ 512) {
    			 activeNodeId.set(activeId);
    		}

    		if ($$self.$$.dirty & /*selectedIds*/ 1) {
    			 selectedNodeIds.set(selectedIds);
    		}

    		if ($$self.$$.dirty & /*expandedIds*/ 1024) {
    			 expandedNodeIds.set(expandedIds);
    		}

    		if ($$self.$$.dirty & /*ref*/ 32) {
    			 if (ref) {
    				treeWalker = document.createTreeWalker(ref, NodeFilter.SHOW_ELEMENT, {
    					acceptNode: node => {
    						if (node.classList.contains("bx--tree-node--disabled")) return NodeFilter.FILTER_REJECT;
    						if (node.matches("li.bx--tree-node")) return NodeFilter.FILTER_ACCEPT;
    						return NodeFilter.FILTER_SKIP;
    					}
    				});
    			}
    		}
    	};

    	return [
    		selectedIds,
    		children,
    		size,
    		labelText,
    		hideLabel,
    		ref,
    		labelId,
    		handleKeyDown,
    		$$restProps,
    		activeId,
    		expandedIds,
    		expandAll,
    		collapseAll,
    		expandNodes,
    		collapseNodes,
    		nodes,
    		keydown_handler,
    		ul_binding
    	];
    }

    class TreeView extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {
    			children: 1,
    			activeId: 9,
    			selectedIds: 0,
    			expandedIds: 10,
    			size: 2,
    			labelText: 3,
    			hideLabel: 4,
    			expandAll: 11,
    			collapseAll: 12,
    			expandNodes: 13,
    			collapseNodes: 14
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TreeView",
    			options,
    			id: create_fragment$3.name
    		});
    	}

    	get children() {
    		throw new Error("<TreeView>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set children(value) {
    		throw new Error("<TreeView>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get activeId() {
    		throw new Error("<TreeView>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set activeId(value) {
    		throw new Error("<TreeView>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selectedIds() {
    		throw new Error("<TreeView>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selectedIds(value) {
    		throw new Error("<TreeView>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get expandedIds() {
    		throw new Error("<TreeView>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set expandedIds(value) {
    		throw new Error("<TreeView>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get size() {
    		throw new Error("<TreeView>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set size(value) {
    		throw new Error("<TreeView>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get labelText() {
    		throw new Error("<TreeView>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set labelText(value) {
    		throw new Error("<TreeView>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hideLabel() {
    		throw new Error("<TreeView>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hideLabel(value) {
    		throw new Error("<TreeView>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get expandAll() {
    		return this.$$.ctx[11];
    	}

    	set expandAll(value) {
    		throw new Error("<TreeView>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get collapseAll() {
    		return this.$$.ctx[12];
    	}

    	set collapseAll(value) {
    		throw new Error("<TreeView>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get expandNodes() {
    		return this.$$.ctx[13];
    	}

    	set expandNodes(value) {
    		throw new Error("<TreeView>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get collapseNodes() {
    		return this.$$.ctx[14];
    	}

    	set collapseNodes(value) {
    		throw new Error("<TreeView>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* webviews/components/Sidebar.svelte generated by Svelte v3.31.0 */

    const { console: console_1 } = globals;

    function create_fragment$4(ctx) {
    	let treeview;
    	let updating_activeId;
    	let updating_selectedIds;
    	let current;

    	function treeview_activeId_binding(value) {
    		/*treeview_activeId_binding*/ ctx[3].call(null, value);
    	}

    	function treeview_selectedIds_binding(value) {
    		/*treeview_selectedIds_binding*/ ctx[4].call(null, value);
    	}

    	let treeview_props = {
    		size: "compact",
    		children: /*children*/ ctx[2]
    	};

    	if (/*activeId*/ ctx[0] !== void 0) {
    		treeview_props.activeId = /*activeId*/ ctx[0];
    	}

    	if (/*selectedIds*/ ctx[1] !== void 0) {
    		treeview_props.selectedIds = /*selectedIds*/ ctx[1];
    	}

    	treeview = new TreeView({ props: treeview_props, $$inline: true });
    	binding_callbacks.push(() => bind(treeview, "activeId", treeview_activeId_binding));
    	binding_callbacks.push(() => bind(treeview, "selectedIds", treeview_selectedIds_binding));
    	treeview.$on("select", /*select_handler*/ ctx[5]);
    	treeview.$on("toggle", /*toggle_handler*/ ctx[6]);
    	treeview.$on("focus", /*focus_handler*/ ctx[7]);

    	const block = {
    		c: function create() {
    			create_component(treeview.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(treeview, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const treeview_changes = {};
    			if (dirty & /*children*/ 4) treeview_changes.children = /*children*/ ctx[2];

    			if (!updating_activeId && dirty & /*activeId*/ 1) {
    				updating_activeId = true;
    				treeview_changes.activeId = /*activeId*/ ctx[0];
    				add_flush_callback(() => updating_activeId = false);
    			}

    			if (!updating_selectedIds && dirty & /*selectedIds*/ 2) {
    				updating_selectedIds = true;
    				treeview_changes.selectedIds = /*selectedIds*/ ctx[1];
    				add_flush_callback(() => updating_selectedIds = false);
    			}

    			treeview.$set(treeview_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(treeview.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(treeview.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(treeview, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function sendMessage(type, detail) {
    	console.log("focus", detail);

    	if (type === "focus" && detail.isFile) {
    		tsvscode.postMessage({
    			type: "open-file",
    			value: detail.resourcePath
    		});
    	}
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Sidebar", slots, []);
    	let activeId = 0;
    	let selectedIds = [];
    	let children = [];

    	onMount(async () => {
    		console.log("onMount");
    		tsvscode.postMessage({ type: "init-tree" });

    		window.addEventListener("message", async event => {
    			const message = event.data;

    			switch (message.type) {
    				case "new-todo":
    					console.log("message", message);
    					$$invalidate(2, children = JSON.parse(message.value));
    					break;
    			}
    		});
    	});

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<Sidebar> was created with unknown prop '${key}'`);
    	});

    	function treeview_activeId_binding(value) {
    		activeId = value;
    		$$invalidate(0, activeId);
    	}

    	function treeview_selectedIds_binding(value) {
    		selectedIds = value;
    		$$invalidate(1, selectedIds);
    	}

    	const select_handler = ({ detail }) => console.log("select", detail);
    	const toggle_handler = ({ detail }) => console.log("toggle", detail);
    	const focus_handler = ({ detail }) => sendMessage("focus", detail);

    	$$self.$capture_state = () => ({
    		onMount,
    		TreeView,
    		activeId,
    		selectedIds,
    		children,
    		sendMessage
    	});

    	$$self.$inject_state = $$props => {
    		if ("activeId" in $$props) $$invalidate(0, activeId = $$props.activeId);
    		if ("selectedIds" in $$props) $$invalidate(1, selectedIds = $$props.selectedIds);
    		if ("children" in $$props) $$invalidate(2, children = $$props.children);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		activeId,
    		selectedIds,
    		children,
    		treeview_activeId_binding,
    		treeview_selectedIds_binding,
    		select_handler,
    		toggle_handler,
    		focus_handler
    	];
    }

    class Sidebar extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Sidebar",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    const app = new Sidebar({
        target: document.body,
    });

    return app;

}());
//# sourceMappingURL=sidebar.js.map
