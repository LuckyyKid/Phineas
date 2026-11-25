using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Phineas.Data.Migrations
{
    /// <inheritdoc />
    public partial class QualificationOpportunite : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "BudgetMensuel",
                table: "OpportunitesVente",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Caracteristiques",
                table: "OpportunitesVente",
                type: "varchar(200)",
                maxLength: 200,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<DateTime>(
                name: "DateCible",
                table: "OpportunitesVente",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ElementsDecision",
                table: "OpportunitesVente",
                type: "varchar(200)",
                maxLength: 200,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "EtatVehicule",
                table: "OpportunitesVente",
                type: "varchar(20)",
                maxLength: 20,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "Marques",
                table: "OpportunitesVente",
                type: "varchar(120)",
                maxLength: 120,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<decimal>(
                name: "MiseDeFonds",
                table: "OpportunitesVente",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ModeAchat",
                table: "OpportunitesVente",
                type: "varchar(20)",
                maxLength: 20,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "Objections",
                table: "OpportunitesVente",
                type: "varchar(500)",
                maxLength: 500,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<int>(
                name: "Places",
                table: "OpportunitesVente",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Reprise",
                table: "OpportunitesVente",
                type: "varchar(20)",
                maxLength: 20,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "RepriseDetail",
                table: "OpportunitesVente",
                type: "varchar(120)",
                maxLength: 120,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "Utilisation",
                table: "OpportunitesVente",
                type: "varchar(20)",
                maxLength: 20,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BudgetMensuel",
                table: "OpportunitesVente");

            migrationBuilder.DropColumn(
                name: "Caracteristiques",
                table: "OpportunitesVente");

            migrationBuilder.DropColumn(
                name: "DateCible",
                table: "OpportunitesVente");

            migrationBuilder.DropColumn(
                name: "ElementsDecision",
                table: "OpportunitesVente");

            migrationBuilder.DropColumn(
                name: "EtatVehicule",
                table: "OpportunitesVente");

            migrationBuilder.DropColumn(
                name: "Marques",
                table: "OpportunitesVente");

            migrationBuilder.DropColumn(
                name: "MiseDeFonds",
                table: "OpportunitesVente");

            migrationBuilder.DropColumn(
                name: "ModeAchat",
                table: "OpportunitesVente");

            migrationBuilder.DropColumn(
                name: "Objections",
                table: "OpportunitesVente");

            migrationBuilder.DropColumn(
                name: "Places",
                table: "OpportunitesVente");

            migrationBuilder.DropColumn(
                name: "Reprise",
                table: "OpportunitesVente");

            migrationBuilder.DropColumn(
                name: "RepriseDetail",
                table: "OpportunitesVente");

            migrationBuilder.DropColumn(
                name: "Utilisation",
                table: "OpportunitesVente");
        }
    }
}
