"use strict";

async function loadExperiences() {
  const list = document.querySelector("#experiences");
  const status = document.querySelector("#catalogue-status");
  const lucky = document.querySelector("#feeling-lucky");
  try {
    const response = await fetch("/experiences.json");
    if (!response.ok) throw new Error("Catalogue unavailable");
    const experiences = await response.json();
    if (!Array.isArray(experiences) || !experiences.length)
      throw new Error("Empty catalogue");
    for (const experience of experiences) {
      if (
        !/^[a-z0-9][a-z0-9-]*$/.test(experience.id) ||
        typeof experience.title !== "string"
      )
        throw new Error("Invalid entry");
    }
    const choices = experiences.map((experience) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `/experiences/${experience.id}/`;
      link.textContent = experience.title;
      link.dataset.experience = experience.id;
      item.append(link);
      list.append(item);
      return link;
    });
    status.hidden = true;
    lucky.hidden = false;
    lucky.addEventListener("click", () =>
      window.location.assign(
        choices[Math.floor(Math.random() * choices.length)].href,
      ),
    );
  } catch {
    status.textContent =
      "Oplevelserne kunne ikke indlæses. Prøv at genindlæse siden.";
  }
}
loadExperiences();
