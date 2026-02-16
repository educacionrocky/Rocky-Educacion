export const qs = (sel, scope = document) => scope.querySelector(sel);
export const qsa = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

export const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null) continue;

    if (key === 'className') {
      node.className = String(value);
      continue;
    }

    if (key === 'style' && typeof value === 'string') {
      node.setAttribute('style', value);
      continue;
    }

    if (key === 'dataset' && typeof value === 'object') {
      for (const [dk, dv] of Object.entries(value)) {
        if (dv === undefined || dv === null) continue;
        node.dataset[dk] = String(dv);
      }
      continue;
    }

    if (key in node) {
      try {
        node[key] = value;
        continue;
      } catch (_) {
        // Some properties are readonly (e.g. input.list); fallback to attribute.
      }
    }

    if (typeof value === 'boolean') {
      if (value) node.setAttribute(key, '');
      else node.removeAttribute(key);
      continue;
    }

    node.setAttribute(key, String(value));
  }

  for (const child of [].concat(children)) {
    node.append(child?.nodeType ? child : document.createTextNode(child ?? ''));
  }

  return node;
};
