export function App(): JSX.Element {
  return <p>The test</p>;
}

export function Html(): JSX.Element {
  return (
    <html>
      <head>
        <title>My test app</title>
      </head>
      <body>
        <div id="app-root">
          <App />
        </div>
      </body>
    </html>
  );
}
