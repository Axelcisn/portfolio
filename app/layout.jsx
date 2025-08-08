import "./globals.css";
import NavBar from "../components/NavBar";

export const metadata = {
  title: "Portfolio",
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
        <NavBar />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}

