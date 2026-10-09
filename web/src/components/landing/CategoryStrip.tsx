import { CATEGORIES } from "./content";

export function CategoryStrip() {
  return (
    <div className="category-strip">
      <span>SIRVE PARA COTIZACIONES DE</span>
      <div className="category-marquee">
        <div className="category-track">
          <ul>
            {CATEGORIES.map((category) => (
              <li key={category}>{category}</li>
            ))}
          </ul>
          {/* The second copy makes the loop seamless; screen readers get the list once. */}
          <ul aria-hidden="true">
            {CATEGORIES.map((category) => (
              <li key={category}>{category}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
