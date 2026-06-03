import { Component } from 'react';
import { Icon } from '../lib/icons.jsx';

/* Catches render/runtime errors in any child route so a single failing page
   shows a recoverable message instead of a blank white screen. Resets when the
   route (key) changes. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // Keep a trace in the console for debugging.
    console.error('Route error:', error, info?.componentStack);
  }
  componentDidUpdate(prev) {
    if (prev.routeKey !== this.props.routeKey && this.state.error) {
      this.setState({ error: null });
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="page"><div className="container">
          <div className="empty">
            <div className="emoji"><Icon name="alert" size={52} /></div>
            <h3>Что-то пошло не так на этой странице</h3>
            <p className="muted" style={{ maxWidth: 520, margin: '6px auto 0', fontSize: 13 }}>
              {String(this.state.error?.message || this.state.error)}
            </p>
            <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>Повторить</button>
              <button className="btn btn-ghost" onClick={() => { window.location.hash = '#/'; this.setState({ error: null }); }}>На главную</button>
            </div>
          </div>
        </div></div>
      );
    }
    return this.props.children;
  }
}
