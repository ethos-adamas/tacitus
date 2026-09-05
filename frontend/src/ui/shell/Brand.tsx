import { version } from '../../../package.json';

const Brand = () => (
  <div className="brand">
    <strong>TACITUS</strong>
    <span className="version">v{version}</span>
    <small>ethos-adamas</small>
  </div>
);

export default Brand;
