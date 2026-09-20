export function ProjectCoverSection({
  category,
  titleLines,
  duration,
  description,
}: {
  category: string;
  titleLines: string[];
  duration: string;
  description: string;
}) {
  return (
    <section className="project-web-section project-cover-section">
      <div className="project-web-container p2-page-rail">
        <div className="project-web-grid project-cover-grid">
          <div className="project-cover-copy">
            {duration ? <p className="project-cover-year">{duration}</p> : null}
            {category ? <p className="project-cover-category">{category}</p> : null}
            {titleLines.length ? (
              <h1 className="project-cover-title">
                {titleLines.map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}
              </h1>
            ) : null}
            {description ? <p className="project-cover-description">{description}</p> : null}
          </div>

        </div>
      </div>
    </section>
  );
}
