// app/layout.jsx
import "./globals.css";
import NavBar from "../components/NavBar";
import { TimeBasisProvider } from "../components/ui/TimeBasisContext";

export const metadata = {
  title: "Momentum",
  description: "Apple-style options toolkit",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Default to dark; respect saved preference without flashing */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  try{
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }catch(e){}
})();
`,
          }}
        />
      </head>
      <body>
        {/* Provide global 365/252 basis to the entire app */}
        <TimeBasisProvider>
          <NavBar />
          <main className="container">{children}</main>
        </TimeBasisProvider>
      </body>
    </html>
  );
}
