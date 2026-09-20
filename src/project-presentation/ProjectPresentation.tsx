import { ProjectCoverSection } from "./ProjectCoverSection";
import { ProjectWebSections } from "./ProjectWebSections";

// The Cover remains the only project-level presentation section. Section
// Intro instances render in their authored TemplateFlowRegion positions.
export function ProjectPresentation({
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
    <>
      <ProjectWebSections>
        <ProjectCoverSection
          category={category}
          titleLines={titleLines}
          duration={duration}
          description={description}
        />
      </ProjectWebSections>
    </>
  );
}
