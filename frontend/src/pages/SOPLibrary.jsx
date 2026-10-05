import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BookOpenText, Search } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import {
  findRelatedArticle,
  getSopArticle,
  getSopModule,
  getVisibleSopArticles,
  getVisibleSopModules,
  searchSops,
} from "../sop/sopRegistry";

export default function SOPLibrary() {
  const { moduleKey, articleKey } = useParams();
  const { user } = useAuthStore();
  const [query, setQuery] = useState("");

  const visibleModules = useMemo(() => getVisibleSopModules(user), [user]);
  const visibleArticles = useMemo(() => getVisibleSopArticles(user), [user]);
  const searchResults = useMemo(() => searchSops(query, user), [query, user]);
  const article = articleKey ? getSopArticle(moduleKey, articleKey) : null;
  const module = moduleKey ? getSopModule(moduleKey) : null;
  const canViewArticle = article && visibleArticles.some((item) => item.path === article.path);

  if (articleKey && !canViewArticle) {
    return (
      <Shell query={query} setQuery={setQuery}>
        <NotFound title="SOP not found" message="This article does not exist or is not available for your current access." />
      </Shell>
    );
  }

  if (article) {
    return (
      <Shell query={query} setQuery={setQuery}>
        <ArticleView article={article} />
      </Shell>
    );
  }

  if (query.trim()) {
    return (
      <Shell query={query} setQuery={setQuery}>
        <section aria-labelledby="search-results-title" className="space-y-4">
          <h2 id="search-results-title" className="text-xl font-semibold text-gray-900 dark:text-white">
            Search results
          </h2>
          {searchResults.length ? (
            <ArticleList articles={searchResults} />
          ) : (
            <NotFound title={`No SOPs found for "${query}"`} message="Try another search term or browse a module category." />
          )}
        </section>
      </Shell>
    );
  }

  if (module) {
    const isVisible = visibleModules.some((item) => item.key === module.key);
    if (!isVisible) {
      return (
        <Shell query={query} setQuery={setQuery}>
          <NotFound title="Category not found" message="This SOP category does not exist or is not available for your current access." />
        </Shell>
      );
    }
    const moduleArticles = visibleArticles.filter((item) => item.moduleKey === module.key);
    return (
      <Shell query={query} setQuery={setQuery}>
        <div className="mb-5">
          <Link to="/sop-library" className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-300">
            <ArrowLeft className="h-4 w-4" /> All categories
          </Link>
        </div>
        <section aria-labelledby="module-title" className="space-y-3">
          <h2 id="module-title" className="text-2xl font-bold text-gray-900 dark:text-white">{module.title}</h2>
          <p className="max-w-3xl text-sm text-gray-600 dark:text-gray-300">{module.summary}</p>
          <ArticleList articles={moduleArticles} />
        </section>
      </Shell>
    );
  }

  return (
    <Shell query={query} setQuery={setQuery}>
      <section aria-labelledby="category-title" className="space-y-4">
        <h2 id="category-title" className="text-xl font-semibold text-gray-900 dark:text-white">Browse by module</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleModules.map((item) => (
            <Link
              key={item.key}
              to={`/sop-library/${item.key}`}
              className="rounded-lg border border-gray-200 bg-white p-4 transition hover:border-primary-300 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-primary-700"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300">
                  <BookOpenText className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{item.title}</h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{item.summary}</p>
                  <p className="mt-3 text-xs font-medium text-gray-500 dark:text-gray-400">{item.articles.length} SOPs</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </Shell>
  );
}

function Shell({ query, setQuery, children }) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase text-primary-600 dark:text-primary-300">User manual</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">SOP Library</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">Learn how to use SynTask features and workflows.</p>
        <label className="relative mt-5 block max-w-2xl">
          <span className="sr-only">Search SOPs</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search SOPs..."
            className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          />
        </label>
      </header>
      {children}
    </main>
  );
}

function ArticleList({ articles }) {
  return (
    <div className="grid gap-3">
      {articles.map((article) => (
        <Link
          key={article.path}
          to={article.path}
          className="flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-4 transition hover:border-primary-300 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-primary-700"
        >
          {/* Mini document thumbnail — local lightweight illustration */}
          <span aria-hidden="true" className="mt-0.5 hidden h-16 w-12 shrink-0 flex-col overflow-hidden rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 sm:flex">
            <span className="h-1.5 bg-primary-500" />
            <span className="flex-1 space-y-1 p-1.5">
              <span className="block h-1 rounded-sm bg-gray-200 dark:bg-gray-600" />
              <span className="block h-1 rounded-sm bg-gray-200 dark:bg-gray-600" />
              <span className="block h-1 w-2/3 rounded-sm bg-gray-200 dark:bg-gray-600" />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase text-primary-600 dark:text-primary-300">{article.moduleTitle}</p>
            <h3 className="mt-1 font-semibold text-gray-900 dark:text-white">{article.title}</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{article.overview}</p>
          </span>
        </Link>
      ))}
    </div>
  );
}

function ArticleView({ article }) {
  return (
    <article className="max-w-4xl">
      <div className="mb-5 flex flex-wrap gap-3">
        <Link to={`/sop-library/${article.moduleKey}`} className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-300">
          <ArrowLeft className="h-4 w-4" /> {article.moduleTitle}
        </Link>
      </div>
      <p className="text-sm font-semibold uppercase text-primary-600 dark:text-primary-300">{article.moduleTitle}</p>
      <h2 className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{article.title}</h2>
      <SopSection title="Overview"><p>{article.overview}</p></SopSection>
      <SopSection title="Who Can Use It"><p>{article.whoCanUse}</p></SopSection>
      <SopSection title="Where To Find It"><p>{article.whereToFind}</p></SopSection>
      <SopList title="Before You Start" items={article.beforeYouStart} />
      <SopList title="Steps" items={article.steps} ordered />
      <SopSection title="Expected Result"><p>{article.expectedResult}</p></SopSection>
      <SopList title="Common Issues" items={article.commonIssues} />
      {article.tips?.length ? <SopList title="Tips" items={article.tips} /> : null}
      <SopSection title="Related SOPs">
        <div className="flex flex-wrap gap-2">
          {article.related.map((title) => {
            const related = findRelatedArticle(title);
            return related ? (
              <Link key={title} to={related.path} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-primary-300 hover:text-primary-700 dark:border-gray-700 dark:text-gray-200 dark:hover:text-primary-300">
                {title}
              </Link>
            ) : (
              <span key={title} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">{title}</span>
            );
          })}
        </div>
      </SopSection>
    </article>
  );
}

function SopSection({ title, children }) {
  return (
    <section className="mt-7">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      <div className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">{children}</div>
    </section>
  );
}

function SopList({ title, items, ordered = false }) {
  const List = ordered ? "ol" : "ul";
  return (
    <SopSection title={title}>
      <List className={`space-y-2 ${ordered ? "list-decimal" : "list-disc"} pl-5`}>
        {items.map((item) => <li key={item}>{item}</li>)}
      </List>
    </SopSection>
  );
}

function NotFound({ title, message }) {
  return (
    <section className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{message}</p>
      <Link to="/sop-library" className="mt-4 inline-flex rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
        Back to SOP Library
      </Link>
    </section>
  );
}
