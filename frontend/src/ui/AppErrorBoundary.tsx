import { Component, type ReactNode } from 'react';

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  failed: boolean;
};

class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state = { failed: false };

  static getDerivedStateFromError = () => ({ failed: true });

  render = () => {
    if (this.state.failed) {
      return (
        <main className="landing">
          <section className="identity-card">
            <p className="brand">TACITUS</p>
            <h1>Tacitus non può essere visualizzato.</h1>
            <p>
              Ricarica l’applicazione. I dati locali non verranno cancellati.
            </p>
            <button className="primary" onClick={() => location.reload()}>
              Ricarica
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  };
}

export default AppErrorBoundary;
