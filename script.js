(() => {
  "use strict";

  const els = {
    year: document.getElementById("year"),
    form: document.getElementById("filters-form"),
    level: document.getElementById("level"),
    credits: document.getElementById("credits"),
    query: document.getElementById("query"),
    cards: document.getElementById("cards"),
    empty: document.getElementById("empty-state"),
    count: document.getElementById("result-count"),
    template: document.getElementById("card-template"),
    resetBtn: document.getElementById("reset-btn")
  };

  if (els.year) {
    els.year.textContent = new Date().getFullYear();
  }

  async function loadCourses() {
    try {
      if (Array.isArray(window.COURSE_DATA) && window.COURSE_DATA.length > 0) {
        return window.COURSE_DATA;
      }

      if (typeof window.getCourseData === "function") {
        const data = await window.getCourseData();
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch (error) {
      console.warn("Custom data provider failed:", error);
    }

    try {
      const response = await fetch("dataset/course_data.json", { 
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("Invalid data format: expected an array");
      }

      return data;
    } catch (error) {
      console.error("Failed to fetch course data:", error);
      throw new Error(
        "No data source available. Please provide window.COURSE_DATA or dataset/course_data.json."
      );
    }
  }

  const debounce = (fn, ms = 200) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), ms);
    };
  };

  function filterByDepartments(items, selectedDepartments) {
    if (!selectedDepartments || selectedDepartments.length === 0) {
      return items;
    }
    const departmentSet = new Set(selectedDepartments);
    return items.filter((course) => departmentSet.has(course.department));
  }

  function filterByLevel(items, level) {
    if (!level) {
      return items;
    }

    const levelStr = String(level).trim();

    if (levelStr === "500") {
      return items.filter((course) => {
        const courseLevel = String(course.level).toLowerCase();
        return courseLevel === "500" || courseLevel === "graduate";
      });
    }

    return items.filter((course) => String(course.level) === levelStr);
  }

  function filterByMinCredits(items, minCreditsStr) {
    if (!minCreditsStr) {
      return items;
    }

    const minCredits = Number(minCreditsStr);
    if (Number.isNaN(minCredits) || minCredits < 0) {
      return items;
    }

    return items.filter((course) => {
      const credits = Number(course.credits);
      return !Number.isNaN(credits) && credits >= minCredits;
    });
  }

  function filterByQuery(items, queryStr) {
    const query = (queryStr || "").trim().toLowerCase();
    
    if (!query) {
      return items;
    }

    return items.filter((course) => {
      const searchableText = [
        course.title,
        course.code,
        course.department,
        course.level,
        course.description
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }

  function getCurrentFilters() {
    const selectedDepartments = Array.from(
      document.querySelectorAll('input[name="dept"]:checked')
    ).map((checkbox) => checkbox.value);

    return {
      departments: selectedDepartments,
      level: els.level.value,
      minCredits: els.credits.value,
      query: els.query.value || ""
    };
  }

  function applyFilters(allCourses) {
    const { departments, level, minCredits, query } = getCurrentFilters();

    let filteredCourses = allCourses;
    filteredCourses = filterByDepartments(filteredCourses, departments);
    filteredCourses = filterByLevel(filteredCourses, level);
    filteredCourses = filterByMinCredits(filteredCourses, minCredits);
    filteredCourses = filterByQuery(filteredCourses, query);

    return filteredCourses;
  }

  function createCourseCard(course) {
    const cardFragment = els.template.content.cloneNode(true);

    const codeEl = cardFragment.querySelector(".code");
    const titleEl = cardFragment.querySelector(".title");
    const departmentEl = cardFragment.querySelector(".department");
    const levelEl = cardFragment.querySelector(".level");
    const creditsEl = cardFragment.querySelector(".credits");
    const descEl = cardFragment.querySelector(".desc");

    if (codeEl) codeEl.textContent = course.code || "N/A";
    if (titleEl) titleEl.textContent = course.title || "Untitled Course";
    if (departmentEl) departmentEl.textContent = course.department || "N/A";
    if (levelEl) levelEl.textContent = course.level || "N/A";
    if (creditsEl) creditsEl.textContent = String(course.credits ?? "N/A");
    if (descEl) descEl.textContent = course.description || "No description available.";

    return cardFragment;
  }

  function renderCourseList(courses) {
    els.cards.innerHTML = "";

    if (courses.length === 0) {
      els.empty.classList.remove("hidden");
      els.cards.setAttribute("aria-busy", "false");
    } else {
      els.empty.classList.add("hidden");

      const fragment = document.createDocumentFragment();
      
      for (const course of courses) {
        fragment.appendChild(createCourseCard(course));
      }

      els.cards.appendChild(fragment);
      els.cards.setAttribute("aria-busy", "false");
    }

    const courseText = courses.length === 1 ? "course" : "courses";
    els.count.textContent = `${courses.length} ${courseText} found`;
  }

  function setupFilterListeners(allCourses) {
    const updateResults = debounce(() => {
      els.cards.setAttribute("aria-busy", "true");
      const filtered = applyFilters(allCourses);
      renderCourseList(filtered);
    }, 150);

    els.form.addEventListener("change", updateResults);
    els.query.addEventListener("input", updateResults);
    els.form.addEventListener("reset", () => {
      setTimeout(() => {
        updateResults();
      }, 0);
    });

    renderCourseList(allCourses);
  }

  function showError(message) {
    console.error("Error:", message);
    
    els.count.textContent = "Failed to load courses.";
    
    const errorParagraph = document.createElement("p");
    errorParagraph.className = "error";
    errorParagraph.setAttribute("role", "alert");
    errorParagraph.textContent = message;
    
    els.cards.replaceWith(errorParagraph);
  }

  async function init() {
    try {
      els.count.textContent = "Loading courses...";
      els.cards.setAttribute("aria-busy", "true");

      const courses = await loadCourses();

      if (!Array.isArray(courses) || courses.length === 0) {
        throw new Error("No courses found in the dataset");
      }

      setupFilterListeners(courses);

      els.count.textContent = `${courses.length} ${courses.length === 1 ? "course" : "courses"} loaded`;
      
      console.log(`Successfully loaded ${courses.length} courses`);
    } catch (error) {
      showError(
        error.message || 
        "No dataset found. Please provide window.COURSE_DATA or add dataset/course_data.json."
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();