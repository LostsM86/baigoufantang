package model

import "time"

type Category struct {
	ID        uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	Name      string    `gorm:"size:64;not null" json:"name"`
	Sort      int       `gorm:"not null;default:10" json:"sort"`
	Enabled   bool      `gorm:"not null;default:true" json:"enabled"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (Category) TableName() string {
	return "food_category"
}
