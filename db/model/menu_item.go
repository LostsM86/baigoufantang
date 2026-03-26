package model

import "time"

type MenuItem struct {
	ID          uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	CategoryID  uint      `gorm:"index;not null" json:"categoryId"`
	Name        string    `gorm:"size:64;not null" json:"name"`
	Description string    `gorm:"size:255" json:"description"`
	Price       float64   `gorm:"type:decimal(10,2);not null;default:0" json:"price"`
	MealSlots   string    `gorm:"size:128;not null" json:"mealSlots"`
	Sort        int       `gorm:"not null;default:10" json:"sort"`
	Enabled     bool      `gorm:"not null;default:true" json:"enabled"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (MenuItem) TableName() string {
	return "food_menu_item"
}
