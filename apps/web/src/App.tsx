import { type PageName } from './content';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Home } from './pages/Home';
import { About } from './pages/About';
import { Team } from './pages/Team';
import { Contact } from './pages/Contact';
const skipLabel = 'Skip to content';
export function App({ page }: { page: PageName }) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        {skipLabel}
      </a>
      <div className="environment">
        <Header page={page} />
        <main id="main-content">
          {page === 'home' ? (
            <Home />
          ) : page === 'about' ? (
            <About />
          ) : page === 'team' ? (
            <Team />
          ) : (
            <Contact />
          )}
        </main>
        <Footer />
      </div>
    </>
  );
}
