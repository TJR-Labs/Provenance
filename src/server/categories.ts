import { Category } from "../../generated/prisma";

export const categoryLabels: Record<Category, string> = {
  [Category.SOFTWARE_ENGINEER]: "Software Engineer",
  [Category.MECHANICAL_ENGINEER]: "Mechanical Engineer",
  [Category.ELECTRICAL_ENGINEER]: "Electrical Engineer",
  [Category.ROBOTICS_ENGINEER]: "Robotics Engineer",
  [Category.ARCHITECT]: "Architect",
  [Category.ARTIST]: "Artist",
  [Category.DESIGNER]: "Designer",
  [Category.DATA_SCIENTIST]: "Data Scientist",
  [Category.WRITER]: "Writer",
  [Category.OTHER]: "Other",
};

export const categories = Object.values(Category);
