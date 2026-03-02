const routes = new Map();
let renderCurrentRoute = () => {};

export const addRoute = (path, renderFn) => routes.set(path, renderFn);
export const navigate = (path) => {
  window.location.hash = path.startsWith('#') ? path : `#${path}`;
};

const getPath = () => (window.location.hash || '#/login').replace('#', '');

export const refreshRoute = () => {
  renderCurrentRoute();
};

export const startRouter = () => {
  const render = () => {
    const path = getPath();
    (routes.get(path) || routes.get('/login'))?.();
  };
  renderCurrentRoute = render;
  window.addEventListener('hashchange', render);
  render();
};
